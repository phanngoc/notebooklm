"""
Neo4j Graph Storage Implementation for Fast GraphRAG
Provides scalable graph storage using Neo4j for production environments.
"""

import json
import os
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, Generic, Iterable, List, Mapping, Optional, Sequence, Tuple, Type, Union

import numpy as np
from neo4j import GraphDatabase, basic_auth
from scipy.sparse import csr_matrix

from fast_graphrag._exceptions import InvalidStorageError
from fast_graphrag._types import GTEdge, GTId, GTNode, TIndex
from fast_graphrag._utils import csr_from_indices_list, logger

from ._base import BaseGraphStorage


@dataclass
class Neo4jStorageConfig(Generic[GTNode, GTEdge]):
    """Configuration for Neo4j graph storage."""
    node_cls: Type[GTNode] = field()
    edge_cls: Type[GTEdge] = field()
    uri: str = field(default="bolt://localhost:7687")
    username: str = field(default="neo4j")
    password: str = field(default="password")
    database: str = field(default="neo4j")
    ppr_damping: float = field(default=0.85)
    max_connections: int = field(default=10)
    encrypted: bool = field(default=True)
    trust: str = field(default="TRUST_ALL_CERTIFICATES")


@dataclass
class Neo4jStorage(BaseGraphStorage[GTNode, GTEdge, GTId]):
    """Neo4j implementation of graph storage for scalable production use."""
    
    config: Neo4jStorageConfig[GTNode, GTEdge] = field()
    _driver: Optional[Any] = field(init=False, default=None)

    def __post_init__(self):
        """Initialize Neo4j driver after dataclass creation."""
        self._init_driver()

    def _init_driver(self):
        """Initialize Neo4j driver with configuration."""
        try:
            print("Connecting to Neo4j...", self.config)
            self._driver = GraphDatabase.driver(
                self.config.uri,
                auth=basic_auth(self.config.username, self.config.password),
            )
            logger.info(f"Connected to Neo4j at {self.config.uri}")
        except Exception as e:
            logger.error(f"Failed to connect to Neo4j: {e}", e)
            raise InvalidStorageError(f"Neo4j connection failed: {e}")

    async def save_graphml(self, path: str) -> None:
        """Export graph to GraphML format."""
        cypher = """
        CALL apoc.export.graphml.all($file, {})
        """
        with self._driver.session(database=self.config.database) as session:
            session.run(cypher, file=path)

    async def node_count(self) -> int:
        """Get total number of nodes in the graph."""
        cypher = "MATCH (n:Entity) RETURN count(n) as count"
        with self._driver.session(database=self.config.database) as session:
            result = session.run(cypher)
            return result.single()["count"]

    async def edge_count(self) -> int:
        """Get total number of edges in the graph."""
        cypher = "MATCH ()-[r:RELATED]->() RETURN count(r) as count"
        with self._driver.session(database=self.config.database) as session:
            result = session.run(cypher)
            return result.single()["count"]

    async def get_node(self, node: Union[GTNode, GTId]) -> Union[Tuple[GTNode, TIndex], Tuple[None, None]]:
        """Retrieve a node by its identifier."""
        if isinstance(node, self.config.node_cls):
            node_id = node.name
        else:
            node_id = node

        cypher = """
        MATCH (n:Entity {name: $node_id})
        RETURN n, elementId(n) as internal_id
        """
        
        with self._driver.session(database=self.config.database) as session:
            result = session.run(cypher, node_id=node_id)
            record = result.single()
            
            if record:
                node_data = dict(record["n"])
                node_obj = self.config.node_cls(**node_data)
                return (node_obj, record["internal_id"])
            
            return (None, None)

    async def get_edges(
        self, source_node: Union[GTId, TIndex], target_node: Union[GTId, TIndex]
    ) -> Iterable[Tuple[GTEdge, TIndex]]:
        """Get all edges between two nodes."""
        cypher = """
        MATCH (s:Entity)-[r:RELATED]->(t:Entity)
        WHERE s.name = $source AND t.name = $target
        RETURN r, elementId(r) as edge_id, s.name as source_name, t.name as target_name
        """
        
        edges: List[Tuple[GTEdge, TIndex]] = []
        
        with self._driver.session(database=self.config.database) as session:
            result = session.run(cypher, source=source_node, target=target_node)
            
            for record in result:
                edge_data = dict(record["r"])
                edge_data["source"] = record["source_name"]
                edge_data["target"] = record["target_name"]
                
                edge_obj = self.config.edge_cls(**edge_data)
                edges.append((edge_obj, record["edge_id"]))
        
        return edges

    async def get_node_by_index(self, index: TIndex) -> Union[GTNode, None]:
        """Get node by Neo4j internal ID."""
        cypher = """
        MATCH (n:Entity)
        WHERE elementId(n) = $index
        RETURN n
        """
        
        with self._driver.session(database=self.config.database) as session:
            result = session.run(cypher, index=index)
            record = result.single()
            
            if record:
                node_data = dict(record["n"])
                return self.config.node_cls(**node_data)
            
            return None

    async def get_edge_by_index(self, index: TIndex) -> Union[GTEdge, None]:
        """Get edge by Neo4j internal ID."""
        cypher = """
        MATCH (s:Entity)-[r:RELATED]->(t:Entity)
        WHERE elementId(r) = $index
        RETURN r, s.name as source_name, t.name as target_name
        """
        
        with self._driver.session(database=self.config.database) as session:
            result = session.run(cypher, index=index)
            record = result.single()
            
            if record:
                edge_data = dict(record["r"])
                edge_data["source"] = record["source_name"]
                edge_data["target"] = record["target_name"]
                
                return self.config.edge_cls(**edge_data)
            
            return None

    async def upsert_node(self, node: GTNode, node_index: Union[TIndex, None]) -> TIndex:
        """Insert or update a node."""
        node_data = asdict(node)
        
        if node_index is not None:
            # Update existing node by internal ID
            cypher = """
            MATCH (n:Entity)
            WHERE elementId(n) = $index
            SET n += $properties
            RETURN elementId(n) as internal_id
            """
            
            with self._driver.session(database=self.config.database) as session:
                result = session.run(cypher, index=node_index, properties=node_data)
                return result.single()["internal_id"]
        else:
            # Create new node or update if exists by name
            cypher = """
            MERGE (n:Entity {name: $name})
            SET n += $properties
            RETURN elementId(n) as internal_id
            """
            
            with self._driver.session(database=self.config.database) as session:
                result = session.run(
                    cypher, 
                    name=node_data.get("name"), 
                    properties=node_data
                )
                return result.single()["internal_id"]

    async def upsert_edge(self, edge: GTEdge, edge_index: Union[TIndex, None]) -> TIndex:
        """Insert or update an edge."""
        edge_data = asdict(edge)
        source = edge_data.pop("source")
        target = edge_data.pop("target")
        
        if edge_index is not None:
            # Update existing edge by internal ID
            cypher = """
            MATCH ()-[r:RELATED]->()
            WHERE elementId(r) = $index
            SET r += $properties
            RETURN elementId(r) as edge_id
            """
            
            with self._driver.session(database=self.config.database) as session:
                result = session.run(cypher, index=edge_index, properties=edge_data)
                return result.single()["edge_id"]
        else:
            # Create new edge
            cypher = """
            MATCH (s:Entity {name: $source})
            MATCH (t:Entity {name: $target})
            CREATE (s)-[r:RELATED]->(t)
            SET r += $properties
            RETURN elementId(r) as edge_id
            """
            
            with self._driver.session(database=self.config.database) as session:
                result = session.run(
                    cypher, 
                    source=source, 
                    target=target, 
                    properties=edge_data
                )
                return result.single()["edge_id"]

    async def insert_edges(
        self,
        edges: Optional[Iterable[GTEdge]] = None,
        indices: Optional[Iterable[Tuple[TIndex, TIndex]]] = None,
        attrs: Optional[Mapping[str, Sequence[Any]]] = None,
    ) -> List[TIndex]:
        """Batch insert edges for better performance."""
        edge_ids: List[TIndex] = []
        
        if edges is not None:
            edges_list = list(edges)
            
            # Batch create edges
            cypher = """
            UNWIND $edges as edge_data
            MATCH (s:Entity {name: edge_data.source})
            MATCH (t:Entity {name: edge_data.target})
            CREATE (s)-[r:RELATED]->(t)
            SET r += edge_data.properties
            RETURN elementId(r) as edge_id
            """
            
            edge_params = []
            for edge in edges_list:
                edge_dict = asdict(edge)
                source = edge_dict.pop("source")
                target = edge_dict.pop("target")
                edge_params.append({
                    "source": source,
                    "target": target,
                    "properties": edge_dict
                })
            
            with self._driver.session(database=self.config.database) as session:
                result = session.run(cypher, edges=edge_params)
                edge_ids = [record["edge_id"] for record in result]
        
        elif indices is not None:
            # Create edges by node indices
            indices_list = list(indices)
            cypher = """
            UNWIND $indices as index_pair
            MATCH (s:Entity) WHERE elementId(s) = index_pair.source
            MATCH (t:Entity) WHERE elementId(t) = index_pair.target
            CREATE (s)-[r:RELATED]->(t)
            SET r += $properties
            RETURN elementId(r) as edge_id
            """
            
            index_params = [
                {"source": src, "target": tgt} 
                for src, tgt in indices_list
            ]
            
            with self._driver.session(database=self.config.database) as session:
                result = session.run(
                    cypher, 
                    indices=index_params, 
                    properties=attrs or {}
                )
                edge_ids = [record["edge_id"] for record in result]
        
        return edge_ids

    async def are_neighbours(self, source_node: Union[GTId, TIndex], target_node: Union[GTId, TIndex]) -> bool:
        """Check if two nodes are connected."""
        cypher = """
        MATCH (s:Entity {name: $source})-[:RELATED]-(t:Entity {name: $target})
        RETURN count(*) > 0 as connected
        """
        
        with self._driver.session(database=self.config.database) as session:
            result = session.run(cypher, source=source_node, target=target_node)
            return result.single()["connected"]

    async def delete_edges_by_index(self, indices: Iterable[TIndex]) -> None:
        """Delete edges by their internal IDs."""
        indices_list = list(indices)
        cypher = """
        UNWIND $indices as edge_id
        MATCH ()-[r:RELATED]->()
        WHERE elementId(r) = edge_id
        DELETE r
        """
        
        with self._driver.session(database=self.config.database) as session:
            session.run(cypher, indices=indices_list)

    async def score_nodes(self, initial_weights: Optional[csr_matrix]) -> csr_matrix:
        """Calculate PageRank scores for nodes."""
        # Use Neo4j GDS library for PageRank algorithm
        cypher_create_graph = """
        CALL gds.graph.project(
            'graphrag_graph',
            'Entity',
            'RELATED',
            {undirectedRelationshipTypes: ['RELATED']}
        )
        """
        
        cypher_pagerank = """
        CALL gds.pageRank.stream('graphrag_graph', {
            dampingFactor: $damping,
            maxIterations: 20
        })
        YIELD nodeId, score
        RETURN nodeId, score
        ORDER BY nodeId
        """
        
        cypher_drop_graph = """
        CALL gds.graph.drop('graphrag_graph')
        """
        
        try:
            with self._driver.session(database=self.config.database) as session:
                # Create in-memory graph projection
                session.run(cypher_create_graph)
                
                # Calculate PageRank
                result = session.run(cypher_pagerank, damping=self.config.ppr_damping)
                scores = [record["score"] for record in result]
                
                # Clean up
                session.run(cypher_drop_graph)
                
                if not scores:
                    return csr_matrix((1, 0))
                
                scores_array = np.array(scores, dtype=np.float32)
                return csr_matrix(scores_array.reshape(1, -1))
                
        except Exception as e:
            logger.error(f"PageRank calculation failed: {e}")
            # Fallback to simple degree centrality
            return await self._fallback_node_scoring()

    async def _fallback_node_scoring(self) -> csr_matrix:
        """Fallback node scoring using degree centrality."""
        cypher = """
        MATCH (n:Entity)
        OPTIONAL MATCH (n)-[:RELATED]-()
        WITH n, count(*) as degree, elementId(n) as node_id
        RETURN node_id, degree
        ORDER BY node_id
        """
        
        with self._driver.session(database=self.config.database) as session:
            result = session.run(cypher)
            degrees = [record["degree"] for record in result]
            
            if not degrees:
                return csr_matrix((1, 0))
            
            # Normalize degrees
            max_degree = max(degrees) if degrees else 1
            normalized_scores = [d / max_degree for d in degrees]
            
            scores_array = np.array(normalized_scores, dtype=np.float32)
            return csr_matrix(scores_array.reshape(1, -1))

    async def get_entities_to_relationships_map(self) -> csr_matrix:
        """Get entity-relationship adjacency matrix."""
        cypher = """
        MATCH (n:Entity)
        WITH n, elementId(n) as node_id
        ORDER BY node_id
        OPTIONAL MATCH (n)-[r:RELATED]-()
        WITH node_id, collect(DISTINCT elementId(r)) as edge_ids
        RETURN node_id, edge_ids
        """
        
        with self._driver.session(database=self.config.database) as session:
            result = session.run(cypher)
            
            node_edges = []
            for record in result:
                edge_ids = record["edge_ids"] or []
                node_edges.append(edge_ids)
            
            if not node_edges:
                return csr_matrix((0, 0))
            
            node_count = await self.node_count()
            edge_count = await self.edge_count()
            
            return csr_from_indices_list(
                node_edges,
                shape=(node_count, edge_count)
            )

    async def get_relationships_attrs(self, key: str) -> List[List[Any]]:
        """Get relationship attributes by key."""
        cypher = f"""
        MATCH ()-[r:RELATED]->()
        RETURN r.{key} as attr_value
        ORDER BY elementId(r)
        """
        
        with self._driver.session(database=self.config.database) as session:
            result = session.run(cypher)
            
            attrs = []
            for record in result:
                attr_value = record["attr_value"]
                if isinstance(attr_value, list):
                    attrs.append(attr_value)
                else:
                    attrs.append([attr_value] if attr_value is not None else [])
            
            return attrs

    async def _insert_start(self):
        """Initialize graph schema and constraints."""
        constraints = [
            "CREATE CONSTRAINT entity_name IF NOT EXISTS FOR (n:Entity) REQUIRE n.name IS UNIQUE",
            "CREATE INDEX entity_name_index IF NOT EXISTS FOR (n:Entity) ON (n.name)"
        ]
        
        with self._driver.session(database=self.config.database) as session:
            for constraint in constraints:
                try:
                    session.run(constraint)
                except Exception as e:
                    logger.debug(f"Constraint/index already exists or failed: {e}")

    async def _insert_done(self):
        """Finalize insert operations."""
        # Could add optimizations like updating statistics
        pass

    async def _query_start(self):
        """Prepare for query operations."""
        pass

    async def _query_done(self):
        """Cleanup after queries."""
        pass

    def close(self):
        """Close Neo4j driver connection."""
        if self._driver:
            self._driver.close()
            logger.info("Neo4j connection closed")

    def __del__(self):
        """Ensure connection is closed on garbage collection."""
        self.close()
