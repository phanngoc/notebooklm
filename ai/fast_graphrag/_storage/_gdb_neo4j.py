"""
Neo4j Graph Storage Implementation for Fast GraphRAG
Provides scalable graph storage using Neo4j for production environments.
"""

import json
import os
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, Generic, Iterable, List, Mapping, Optional, Sequence, Tuple, Type, Union, cast, LiteralString

import numpy as np
from neo4j import GraphDatabase, basic_auth, Driver
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
    _driver: Driver = field(init=False)

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

    async def _get_node_sequence_id(self, node_name: str) -> int:
        """Get or create a sequence ID for a node using database-stored counter."""
        cypher = """
        OPTIONAL MATCH (existing:Entity)
        WITH coalesce(max(existing.sequence_id), -1) + 1 AS next_id
        MERGE (n:Entity {name: $node_name})
        ON CREATE SET n.sequence_id = next_id
        ON MATCH SET n.sequence_id = coalesce(n.sequence_id, next_id)
        RETURN n.sequence_id as sequence_id
        """
        with self._driver.session(database=self.config.database) as session:
            result = session.run(cypher, node_name=node_name)
            record = result.single()
            if record is None:
                raise RuntimeError(f"Failed to get or create sequence ID for node: {node_name}")
            return record["sequence_id"]

    async def _get_edge_sequence_id(self, source_name: str, target_name: str, relationship_type: str = "RELATED") -> int:
        """Get or create a sequence ID for an edge using database-stored counter."""
        cypher = """
        MATCH (s:Entity {name: $source_name}), (t:Entity {name: $target_name})
        OPTIONAL MATCH ()-[existing_rel:RELATED]->()
        WITH s, t, coalesce(max(existing_rel.sequence_id), -1) + 1 AS next_id
        MERGE (s)-[r:RELATED]->(t)
        ON CREATE SET r.sequence_id = next_id
        ON MATCH SET r.sequence_id = coalesce(r.sequence_id, next_id)
        RETURN r.sequence_id as sequence_id
        """
        with self._driver.session(database=self.config.database) as session:
            result = session.run(cypher, source_name=source_name, target_name=target_name)
            record = result.single()
            if record is None:
                raise RuntimeError(f"Failed to get or create sequence ID for edge: {source_name} -> {target_name}")
            return record["sequence_id"]

    async def _get_node_by_sequence_id(self, sequence_id: int) -> Optional[str]:
        """Get node name by sequence ID."""
        cypher = """
        MATCH (n:Entity {sequence_id: $sequence_id})
        RETURN n.name as name
        """
        with self._driver.session(database=self.config.database) as session:
            result = session.run(cypher, sequence_id=sequence_id)
            record = result.single()
            return record["name"] if record else None

    async def _get_edge_by_sequence_id(self, sequence_id: int) -> Optional[Tuple[str, str]]:
        """Get edge source and target names by sequence ID."""
        cypher = """
        MATCH (s:Entity)-[r:RELATED {sequence_id: $sequence_id}]->(t:Entity)
        RETURN s.name as source_name, t.name as target_name
        """
        with self._driver.session(database=self.config.database) as session:
            result = session.run(cypher, sequence_id=sequence_id)
            record = result.single()
            return (record["source_name"], record["target_name"]) if record else None

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
            record = result.single()
            if record is None:
                return 0
            return record["count"]

    async def edge_count(self) -> int:
        """Get total number of edges in the graph."""
        cypher = "MATCH ()-[r:RELATED]->() RETURN count(r) as count"
        with self._driver.session(database=self.config.database) as session:
            result = session.run(cypher)
            record = result.single()
            if record is None:
                return 0
            return record["count"]

    async def get_node(self, node: Union[GTNode, GTId]) -> Union[Tuple[GTNode, TIndex], Tuple[None, None]]:
        """Retrieve a node by its identifier."""
        if isinstance(node, self.config.node_cls):
            node_id = node.name
        else:
            node_id = node

        cypher = """
        MATCH (n:Entity {name: $node_id})
        RETURN n, n.sequence_id as sequence_id
        """
        print("Fetching node by ID:", node_id)
        with self._driver.session(database=self.config.database) as session:
            result = session.run(cypher, node_id=node_id)
            record = result.single()
            
            if record:
                node_data = dict(record["n"])
                # Deserialize nested collections
                node_data = self._deserialize_nested_collections(node_data)
                
                # Remove sequence_id from node data as it's internal
                node_data.pop('sequence_id', None)
                
                node_obj = self.config.node_cls(**node_data)
                sequence_id = record["sequence_id"]
                return (node_obj, sequence_id)
            
            return (None, None)

    async def get_edges(
        self, source_node: Union[GTId, TIndex], target_node: Union[GTId, TIndex]
    ) -> Iterable[Tuple[GTEdge, TIndex]]:
        """Get all edges between two nodes."""
        cypher = """
        MATCH (s:Entity)-[r:RELATED]->(t:Entity)
        WHERE s.name = $source AND t.name = $target
        RETURN r, r.sequence_id as sequence_id, s.name as source_name, t.name as target_name
        """
        
        edges: List[Tuple[GTEdge, TIndex]] = []
        
        with self._driver.session(database=self.config.database) as session:
            result = session.run(cypher, source=source_node, target=target_node)
            
            for record in result:
                edge_data = dict(record["r"])
                edge_data["source"] = record["source_name"]
                edge_data["target"] = record["target_name"]
                
                # Deserialize nested collections
                edge_data = self._deserialize_nested_collections(edge_data)
                
                # Remove sequence_id from edge data as it's internal
                edge_data.pop('sequence_id', None)
                
                edge_obj = self.config.edge_cls(**edge_data)
                sequence_id = record["sequence_id"]
                edges.append((edge_obj, sequence_id))
        
        return edges

    async def get_node_by_index(self, index: TIndex) -> Union[GTNode, None]:
        """Get node by sequence ID."""
        cypher = """
        MATCH (n:Entity {sequence_id: $sequence_id})
        RETURN n
        """
        
        with self._driver.session(database=self.config.database) as session:
            result = session.run(cypher, sequence_id=index)
            record = result.single()
            
            if record:
                node_data = dict(record["n"])
                # Deserialize nested collections
                node_data = self._deserialize_nested_collections(node_data)
                
                # Remove sequence_id from node data as it's internal
                node_data.pop('sequence_id', None)
                
                return self.config.node_cls(**node_data)
            
            return None

    async def get_edge_by_index(self, index: TIndex) -> Union[GTEdge, None]:
        """Get edge by sequence ID."""
        cypher = """
        MATCH (s:Entity)-[r:RELATED {sequence_id: $sequence_id}]->(t:Entity)
        RETURN r, s.name as source_name, t.name as target_name
        """
        
        with self._driver.session(database=self.config.database) as session:
            result = session.run(cypher, sequence_id=index)
            record = result.single()
            
            if record:
                edge_data = dict(record["r"])
                edge_data["source"] = record["source_name"]
                edge_data["target"] = record["target_name"]
                
                # Deserialize nested collections
                edge_data = self._deserialize_nested_collections(edge_data)
                
                # Remove sequence_id from edge data as it's internal
                edge_data.pop('sequence_id', None)
                
                return self.config.edge_cls(**edge_data)
            
            return None

    async def upsert_node(self, node: GTNode, node_index: Union[TIndex, None]) -> TIndex:
        """Insert or update a node."""
        node_data = asdict(node)
        
        # Serialize nested collections
        node_data = self._serialize_nested_collections(node_data)
        
        print("Upserting node:", node_data, "Index:", node_index)
        if node_index is not None:
            # Update existing node by sequence ID
            cypher = """
            MATCH (n:Entity {sequence_id: $sequence_id})
            SET n += $properties
            RETURN n.sequence_id as sequence_id
            """
            
            with self._driver.session(database=self.config.database) as session:
                result = session.run(cypher, sequence_id=node_index, properties=node_data)
                record = result.single()
                return record["sequence_id"] if record else node_index
        else:
            # Create new node with auto-generated sequence ID
            cypher = """
            OPTIONAL MATCH (existing:Entity)
            WITH coalesce(max(existing.sequence_id), -1) + 1 AS next_id
            MERGE (n:Entity {name: $name})
            ON CREATE SET n.sequence_id = next_id
            ON MATCH SET n.sequence_id = coalesce(n.sequence_id, next_id)
            SET n += $properties
            RETURN n.sequence_id as sequence_id
            """
            
            with self._driver.session(database=self.config.database) as session:
                result = session.run(
                    cypher, 
                    name=node_data.get("name"), 
                    properties=node_data
                )
                record = result.single()
                if record is None:
                    raise RuntimeError(f"Failed to upsert node: {node_data.get('name')}")
                return record["sequence_id"]

    async def upsert_edge(self, edge: GTEdge, edge_index: Union[TIndex, None]) -> TIndex:
        """Insert or update an edge."""
        edge_data = asdict(edge)
        source = edge_data.pop("source")
        target = edge_data.pop("target")
        
        # Serialize nested collections
        edge_data = self._serialize_nested_collections(edge_data)
        
        if edge_index is not None:
            # Update existing edge by sequence ID
            cypher = """
            MATCH (s:Entity)-[r:RELATED {sequence_id: $sequence_id}]->(t:Entity)
            SET r += $properties
            RETURN r.sequence_id as sequence_id
            """
            
            with self._driver.session(database=self.config.database) as session:
                result = session.run(cypher, sequence_id=edge_index, properties=edge_data)
                record = result.single()
                return record["sequence_id"] if record else edge_index
        else:
            # Create new edge with auto-generated sequence ID
            cypher = """
            MATCH (s:Entity {name: $source}), (t:Entity {name: $target})
            OPTIONAL MATCH ()-[existing_rel:RELATED]->()
            WITH s, t, coalesce(max(existing_rel.sequence_id), -1) + 1 AS next_id
            MERGE (s)-[r:RELATED]->(t)
            ON CREATE SET r.sequence_id = next_id
            ON MATCH SET r.sequence_id = coalesce(r.sequence_id, next_id)
            SET r += $properties
            RETURN r.sequence_id as sequence_id
            """
            
            with self._driver.session(database=self.config.database) as session:
                result = session.run(
                    cypher, 
                    source=source, 
                    target=target, 
                    properties=edge_data
                )
                record = result.single()
                if record is None:
                    raise RuntimeError(f"Failed to upsert edge: {source} -> {target}")
                return record["sequence_id"]

    def _serialize_nested_collections(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Serialize nested collections to JSON strings for Neo4j storage."""
        serialized = {}
        for key, value in data.items():
            if isinstance(value, (list, tuple)):
                # Check if it's a nested collection
                if value and isinstance(value[0], (list, tuple, dict)):
                    serialized[key] = json.dumps(value)
                else:
                    serialized[key] = value
            elif isinstance(value, dict):
                serialized[key] = json.dumps(value)
            else:
                serialized[key] = value
        return serialized

    def _deserialize_nested_collections(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Deserialize JSON strings back to nested collections."""
        deserialized = {}
        for key, value in data.items():
            if isinstance(value, str):
                try:
                    # Try to parse as JSON
                    parsed = json.loads(value)
                    if isinstance(parsed, (list, dict)):
                        deserialized[key] = parsed
                    else:
                        deserialized[key] = value
                except (json.JSONDecodeError, TypeError):
                    deserialized[key] = value
            else:
                deserialized[key] = value
        return deserialized

    async def insert_edges(
        self,
        edges: Optional[Iterable[GTEdge]] = None,
        indices: Optional[Iterable[Tuple[TIndex, TIndex]]] = None,
        attrs: Optional[Mapping[str, Sequence[Any]]] = None,
    ) -> List[TIndex]:
        """Batch insert edges for better performance."""
        edge_ids: List[TIndex] = []
        print("Starting batch edge insertion...", edges, indices, attrs)
        if edges is not None:
            edges_list = list(edges)
            
            # Batch create edges with sequence IDs
            cypher = """
            OPTIONAL MATCH ()-[existing_rel:RELATED]->()
            WITH coalesce(max(existing_rel.sequence_id), -1) AS max_seq_id
            UNWIND range(0, size($edges) - 1) AS idx
            WITH max_seq_id, idx, $edges[idx] AS edge_data
            MATCH (s:Entity {name: edge_data.source})
            MATCH (t:Entity {name: edge_data.target})
            CREATE (s)-[r:RELATED]->(t)
            SET r += edge_data.properties,
                r.sequence_id = max_seq_id + idx + 1
            RETURN r.sequence_id as sequence_id
            """
            
            edge_params = []
            for edge in edges_list:
                edge_dict = asdict(edge)
                source = edge_dict.pop("source")
                target = edge_dict.pop("target")
                # Serialize nested collections
                edge_dict = self._serialize_nested_collections(edge_dict)
                edge_params.append({
                    "source": source,
                    "target": target,
                    "properties": edge_dict
                })
            
            with self._driver.session(database=self.config.database) as session:
                result = session.run(cypher, edges=edge_params)
                for record in result:
                    sequence_id = record["sequence_id"]
                    edge_ids.append(sequence_id)
        
        elif indices is not None:
            # Create edges by node sequence IDs
            indices_list = list(indices)
            
            # Convert sequence IDs to node names for the query
            node_pairs = []
            for src_idx, tgt_idx in indices_list:
                src_name = await self._get_node_by_sequence_id(src_idx)
                tgt_name = await self._get_node_by_sequence_id(tgt_idx)
                if src_name and tgt_name:
                    node_pairs.append({"source": src_name, "target": tgt_name})
            
            if node_pairs and attrs:
                # Serialize nested collections in attrs
                serialized_attrs = self._serialize_nested_collections(dict(attrs))
                
                cypher = """
                OPTIONAL MATCH ()-[existing_rel:RELATED]->()
                WITH coalesce(max(existing_rel.sequence_id), -1) AS max_seq_id
                UNWIND range(0, size($indices) - 1) AS idx
                WITH max_seq_id, idx, $indices[idx] AS node_pair
                MATCH (s:Entity {name: node_pair.source})
                MATCH (t:Entity {name: node_pair.target})
                CREATE (s)-[r:RELATED]->(t)
                SET r += $properties,
                    r.sequence_id = max_seq_id + idx + 1
                RETURN r.sequence_id as sequence_id
                """
                
                with self._driver.session(database=self.config.database) as session:
                    result = session.run(
                        cypher, 
                        indices=node_pairs, 
                        properties=serialized_attrs
                    )
                    for record in result:
                        sequence_id = record["sequence_id"]
                        edge_ids.append(sequence_id)
            elif node_pairs:
                # No attributes to set, just create edges
                cypher = """
                OPTIONAL MATCH ()-[existing_rel:RELATED]->()
                WITH coalesce(max(existing_rel.sequence_id), -1) AS max_seq_id
                UNWIND range(0, size($indices) - 1) AS idx
                WITH max_seq_id, idx, $indices[idx] AS node_pair
                MATCH (s:Entity {name: node_pair.source})
                MATCH (t:Entity {name: node_pair.target})
                CREATE (s)-[r:RELATED]->(t)
                SET r.sequence_id = max_seq_id + idx + 1
                RETURN r.sequence_id as sequence_id
                """
                
                with self._driver.session(database=self.config.database) as session:
                    result = session.run(cypher, indices=node_pairs)
                    for record in result:
                        sequence_id = record["sequence_id"]
                        edge_ids.append(sequence_id)
        
        return edge_ids

    async def are_neighbours(self, source_node: Union[GTId, TIndex], target_node: Union[GTId, TIndex]) -> bool:
        """Check if two nodes are connected."""
        cypher = """
        MATCH (s:Entity {name: $source})-[:RELATED]-(t:Entity {name: $target})
        RETURN count(*) > 0 as connected
        """
        
        with self._driver.session(database=self.config.database) as session:
            result = session.run(cypher, source=source_node, target=target_node)
            record = result.single()
            if record is None:
                return False
            return record["connected"]

    async def delete_edges_by_index(self, indices: Iterable[TIndex]) -> None:
        """Delete edges by their sequence IDs."""
        indices_list = list(indices)
        
        if indices_list:
            cypher = """
            UNWIND $sequence_ids as sequence_id
            MATCH ()-[r:RELATED {sequence_id: sequence_id}]->()
            DELETE r
            """
            
            with self._driver.session(database=self.config.database) as session:
                session.run(cypher, sequence_ids=indices_list)

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
        CALL gds.graph.drop('graphrag_graph') YIELD graphName
        RETURN graphName
        """
        
        try:
            with self._driver.session(database=self.config.database) as session:
                # Create in-memory graph projection
                session.run(cypher_create_graph)
                
                # Calculate PageRank
                result = session.run(cypher_pagerank, damping=self.config.ppr_damping)
                scores = [record["score"] for record in result]
                print(f"PageRank scores calculated: {len(scores)} nodes", scores)
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
        WITH n, count(*) as degree, n.sequence_id as node_seq_id
        RETURN node_seq_id, degree
        ORDER BY node_seq_id
        """
        
        with self._driver.session(database=self.config.database) as session:
            result = session.run(cypher)
            
            # Create a list to store degrees by integer index
            max_index = -1
            degree_map = {}
            
            for record in result:
                node_seq_id = record["node_seq_id"]
                degree = record["degree"]
                degree_map[node_seq_id] = degree
                max_index = max(max_index, node_seq_id)
            
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
        WITH n, n.sequence_id as node_seq_id
        ORDER BY node_seq_id
        OPTIONAL MATCH (n)-[r:RELATED]-()
        WITH n.sequence_id as node_seq_id, collect(DISTINCT r.sequence_id) as edge_seq_ids
        RETURN node_seq_id, edge_seq_ids
        """
        
        with self._driver.session(database=self.config.database) as session:
            result = session.run(cypher)
            
            node_edges = []
            max_node_idx = -1
            
            for record in result:
                node_seq_id = record["node_seq_id"] or 0
                edge_seq_ids = record["edge_seq_ids"] or []
                
                # Ensure we have enough entries in the list
                while len(node_edges) <= node_seq_id:
                    node_edges.append([])
                
                node_edges[node_seq_id] = [eid for eid in edge_seq_ids if eid is not None]
                max_node_idx = max(max_node_idx, node_seq_id)
            
            if max_node_idx == -1:
                return csr_matrix((0, 0))
            
            node_count = await self.node_count()
            edge_count = await self.edge_count()
            
            return csr_from_indices_list(
                node_edges,
                shape=(node_count, edge_count)
            )

    async def get_relationships_attrs(self, key: str) -> List[List[Any]]:
        """Get relationship attributes by key."""
        # Neo4j doesn't support parameterized property names, so we need to validate the key
        # to prevent injection attacks
        if not key.replace('_', '').isalnum():
            raise ValueError(f"Invalid property key: {key}")
            
        cypher = f"""
        MATCH ()-[r:RELATED]->()
        RETURN r.`{key}` as attr_value, r.sequence_id as edge_seq_id
        ORDER BY r.sequence_id
        """
        
        with self._driver.session(database=self.config.database) as session:
            result = session.run(cast(LiteralString, cypher))
            
            # Create a map from sequence ID to attribute values
            max_index = -1
            attr_map = {}
            
            for record in result:
                edge_seq_id = record["edge_seq_id"] or 0
                attr_value = record["attr_value"]
                
                # Handle deserialization of JSON strings
                if isinstance(attr_value, str):
                    try:
                        parsed = json.loads(attr_value)
                        if isinstance(parsed, list):
                            attr_map[edge_seq_id] = parsed
                        else:
                            attr_map[edge_seq_id] = [parsed] if parsed is not None else []
                    except (json.JSONDecodeError, TypeError):
                        attr_map[edge_seq_id] = [attr_value] if attr_value is not None else []
                elif isinstance(attr_value, list):
                    attr_map[edge_seq_id] = attr_value
                else:
                    attr_map[edge_seq_id] = [attr_value] if attr_value is not None else []
                
                max_index = max(max_index, edge_seq_id)
            
            # Create ordered list of attributes
            attrs = []
            for i in range(max_index + 1):
                attrs.append(attr_map.get(i, []))
            
            return attrs

    async def _insert_start(self):
        """Initialize graph schema and constraints."""
        constraints = [
            "CREATE CONSTRAINT entity_name IF NOT EXISTS FOR (n:Entity) REQUIRE n.name IS UNIQUE",
            "CREATE INDEX entity_name_index IF NOT EXISTS FOR (n:Entity) ON (n.name)",
            "CREATE INDEX entity_sequence_id IF NOT EXISTS FOR (n:Entity) ON (n.sequence_id)",
            "CREATE INDEX relationship_sequence_id IF NOT EXISTS FOR ()-[r:RELATED]-() ON (r.sequence_id)"
        ]
        
        with self._driver.session(database=self.config.database) as session:
            for constraint in constraints:
                try:
                    session.run(cast(LiteralString, constraint))
                except Exception as e:
                    logger.debug(f"Constraint/index already exists or failed: {e}")

    async def _insert_done(self):
        """Finalize insert operations."""
        # Could add optimizations like updating statistics
        pass

    async def _query_start(self):
        """Prepare for query operations."""
        # No need to load mappings anymore - using direct database queries
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
