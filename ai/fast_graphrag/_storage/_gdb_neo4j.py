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
    _node_id_map: Dict[str, int] = field(init=False, default_factory=dict)
    _edge_id_map: Dict[str, int] = field(init=False, default_factory=dict)
    _next_node_id: int = field(init=False, default=0)
    _next_edge_id: int = field(init=False, default=0)

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

    def _get_node_index(self, neo4j_id: str) -> int:
        """Convert Neo4j element ID to internal integer index."""
        if neo4j_id not in self._node_id_map:
            self._node_id_map[neo4j_id] = self._next_node_id
            self._next_node_id += 1
        return self._node_id_map[neo4j_id]

    def _get_edge_index(self, neo4j_id: str) -> int:
        """Convert Neo4j element ID to internal integer index."""
        if neo4j_id not in self._edge_id_map:
            self._edge_id_map[neo4j_id] = self._next_edge_id
            self._next_edge_id += 1
        return self._edge_id_map[neo4j_id]

    def _get_neo4j_node_id(self, index: int) -> Optional[str]:
        """Convert internal integer index back to Neo4j element ID."""
        for neo4j_id, idx in self._node_id_map.items():
            if idx == index:
                return neo4j_id
        return None

    def _get_neo4j_edge_id(self, index: int) -> Optional[str]:
        """Convert internal integer index back to Neo4j element ID."""
        for neo4j_id, idx in self._edge_id_map.items():
            if idx == index:
                return neo4j_id
        return None

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
                neo4j_id = record["internal_id"]
                integer_index = self._get_node_index(neo4j_id)
                return (node_obj, integer_index)
            
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
                neo4j_edge_id = record["edge_id"]
                integer_index = self._get_edge_index(neo4j_edge_id)
                edges.append((edge_obj, integer_index))
        
        return edges

    async def get_node_by_index(self, index: TIndex) -> Union[GTNode, None]:
        """Get node by internal integer index."""
        neo4j_id = self._get_neo4j_node_id(index)
        if neo4j_id is None:
            return None
            
        cypher = """
        MATCH (n:Entity)
        WHERE elementId(n) = $neo4j_id
        RETURN n
        """
        
        with self._driver.session(database=self.config.database) as session:
            result = session.run(cypher, neo4j_id=neo4j_id)
            record = result.single()
            
            if record:
                node_data = dict(record["n"])
                return self.config.node_cls(**node_data)
            
            return None

    async def get_edge_by_index(self, index: TIndex) -> Union[GTEdge, None]:
        """Get edge by internal integer index."""
        neo4j_id = self._get_neo4j_edge_id(index)
        if neo4j_id is None:
            return None
            
        cypher = """
        MATCH (s:Entity)-[r:RELATED]->(t:Entity)
        WHERE elementId(r) = $neo4j_id
        RETURN r, s.name as source_name, t.name as target_name
        """
        
        with self._driver.session(database=self.config.database) as session:
            result = session.run(cypher, neo4j_id=neo4j_id)
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
            # Update existing node by internal index
            neo4j_id = self._get_neo4j_node_id(node_index)
            if neo4j_id is None:
                raise InvalidStorageError(f"Node index {node_index} not found in mapping")
                
            cypher = """
            MATCH (n:Entity)
            WHERE elementId(n) = $neo4j_id
            SET n += $properties
            RETURN elementId(n) as internal_id
            """
            
            with self._driver.session(database=self.config.database) as session:
                result = session.run(cypher, neo4j_id=neo4j_id, properties=node_data)
                neo4j_element_id = result.single()["internal_id"]
                return self._get_node_index(neo4j_element_id)
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
                neo4j_element_id = result.single()["internal_id"]
                return self._get_node_index(neo4j_element_id)

    async def upsert_edge(self, edge: GTEdge, edge_index: Union[TIndex, None]) -> TIndex:
        """Insert or update an edge."""
        edge_data = asdict(edge)
        source = edge_data.pop("source")
        target = edge_data.pop("target")
        
        if edge_index is not None:
            # Update existing edge by internal index
            neo4j_id = self._get_neo4j_edge_id(edge_index)
            if neo4j_id is None:
                raise InvalidStorageError(f"Edge index {edge_index} not found in mapping")
                
            cypher = """
            MATCH ()-[r:RELATED]->()
            WHERE elementId(r) = $neo4j_id
            SET r += $properties
            RETURN elementId(r) as edge_id
            """
            
            with self._driver.session(database=self.config.database) as session:
                result = session.run(cypher, neo4j_id=neo4j_id, properties=edge_data)
                neo4j_element_id = result.single()["edge_id"]
                return self._get_edge_index(neo4j_element_id)
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
                neo4j_element_id = result.single()["edge_id"]
                return self._get_edge_index(neo4j_element_id)

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
                for record in result:
                    neo4j_element_id = record["edge_id"]
                    integer_index = self._get_edge_index(neo4j_element_id)
                    edge_ids.append(integer_index)
        
        elif indices is not None:
            # Create edges by node indices
            indices_list = list(indices)
            
            # Convert integer indices back to Neo4j IDs for the query
            neo4j_pairs = []
            for src_idx, tgt_idx in indices_list:
                src_neo4j_id = self._get_neo4j_node_id(src_idx)
                tgt_neo4j_id = self._get_neo4j_node_id(tgt_idx)
                if src_neo4j_id and tgt_neo4j_id:
                    neo4j_pairs.append({"source": src_neo4j_id, "target": tgt_neo4j_id})
            
            if neo4j_pairs:
                cypher = """
                UNWIND $indices as index_pair
                MATCH (s:Entity) WHERE elementId(s) = index_pair.source
                MATCH (t:Entity) WHERE elementId(t) = index_pair.target
                CREATE (s)-[r:RELATED]->(t)
                SET r += $properties
                RETURN elementId(r) as edge_id
                """
                
                with self._driver.session(database=self.config.database) as session:
                    result = session.run(
                        cypher, 
                        indices=neo4j_pairs, 
                        properties=attrs or {}
                    )
                    for record in result:
                        neo4j_element_id = record["edge_id"]
                        integer_index = self._get_edge_index(neo4j_element_id)
                        edge_ids.append(integer_index)
        
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
        """Delete edges by their internal integer indices."""
        indices_list = list(indices)
        
        # Convert integer indices to Neo4j element IDs
        neo4j_ids = []
        for idx in indices_list:
            neo4j_id = self._get_neo4j_edge_id(idx)
            if neo4j_id:
                neo4j_ids.append(neo4j_id)
        
        if neo4j_ids:
            cypher = """
            UNWIND $neo4j_ids as edge_id
            MATCH ()-[r:RELATED]->()
            WHERE elementId(r) = edge_id
            DELETE r
            """
            
            with self._driver.session(database=self.config.database) as session:
                session.run(cypher, neo4j_ids=neo4j_ids)

    async def score_nodes(self, initial_weights: Optional[csr_matrix]) -> csr_matrix:
        """Calculate PageRank scores for nodes."""
        # Use Neo4j GDS library for PageRank algorithm
        cypher_create_graph = """
        CALL gds.graph.project(
            'graphrag_graph',
            'Entity',
            {
                RELATED: {
                    orientation: 'UNDIRECTED'
                }
            }
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
            
            # Create a list to store degrees by integer index
            max_index = -1
            degree_map = {}
            
            for record in result:
                node_neo4j_id = record["node_id"]
                degree = record["degree"]
                node_idx = self._get_node_index(node_neo4j_id)
                degree_map[node_idx] = degree
                max_index = max(max_index, node_idx)
            
            if max_index == -1:
                return csr_matrix((1, 0))
            
            # Create ordered list of degrees
            degrees = []
            for i in range(max_index + 1):
                degrees.append(degree_map.get(i, 0))
            
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
        WITH elementId(n) as node_id, collect(DISTINCT elementId(r)) as edge_ids
        RETURN node_id, edge_ids
        """
        
        with self._driver.session(database=self.config.database) as session:
            result = session.run(cypher)
            
            node_edges = []
            for record in result:
                node_neo4j_id = record["node_id"]
                edge_neo4j_ids = record["edge_ids"] or []
                
                # Convert Neo4j IDs to integer indices
                node_idx = self._get_node_index(node_neo4j_id)
                edge_indices = [self._get_edge_index(edge_id) for edge_id in edge_neo4j_ids if edge_id]
                
                # Ensure we have enough entries in the list
                while len(node_edges) <= node_idx:
                    node_edges.append([])
                
                node_edges[node_idx] = edge_indices
            
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
        RETURN r.{key} as attr_value, elementId(r) as edge_id
        ORDER BY elementId(r)
        """
        
        with self._driver.session(database=self.config.database) as session:
            result = session.run(cypher)
            
            # Create a map from integer index to attribute values
            max_index = -1
            attr_map = {}
            
            for record in result:
                edge_neo4j_id = record["edge_id"]
                attr_value = record["attr_value"]
                edge_idx = self._get_edge_index(edge_neo4j_id)
                
                if isinstance(attr_value, list):
                    attr_map[edge_idx] = attr_value
                else:
                    attr_map[edge_idx] = [attr_value] if attr_value is not None else []
                
                max_index = max(max_index, edge_idx)
            
            # Create ordered list of attributes
            attrs = []
            for i in range(max_index + 1):
                attrs.append(attr_map.get(i, []))
            
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
        
        # Initialize ID mappings for existing nodes and edges
        await self._initialize_id_mappings()

    async def _initialize_id_mappings(self):
        """Initialize ID mappings for existing nodes and edges in the database."""
        # Initialize node mappings
        cypher_nodes = "MATCH (n:Entity) RETURN elementId(n) as node_id ORDER BY node_id"
        with self._driver.session(database=self.config.database) as session:
            result = session.run(cypher_nodes)
            for record in result:
                self._get_node_index(record["node_id"])
        
        # Initialize edge mappings
        cypher_edges = "MATCH ()-[r:RELATED]->() RETURN elementId(r) as edge_id ORDER BY edge_id"
        with self._driver.session(database=self.config.database) as session:
            result = session.run(cypher_edges)
            for record in result:
                self._get_edge_index(record["edge_id"])

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
