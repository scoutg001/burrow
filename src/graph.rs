//! Pure assembly: raw API topology in, GraphModel out. No I/O, fully
//! unit-tested against the fixtures.

use crate::collect::Topology;
use crate::model::{Edge, EdgeKind, GraphModel, Health, Node, NodeKind};

fn online(b: bool) -> Health {
    Health { online: b, ..Default::default() }
}

pub fn assemble(t: &Topology) -> GraphModel {
    let mut nodes = Vec::new();
    let mut edges = Vec::new();

    nodes.push(Node {
        id: "hub".into(),
        kind: NodeKind::Hub,
        name: t.org.name.clone(),
        addresses: vec![],
        health: online(true),
    });

    for s in &t.sites {
        let id = format!("site:{}", s.site_id);
        let mut addresses = Vec::new();
        if let Some(a) = &s.address {
            addresses.push(a.clone());
        }
        if let Some(sn) = &s.subnet {
            addresses.push(sn.clone());
        }
        nodes.push(Node {
            id: id.clone(),
            kind: NodeKind::Site,
            name: s.name.clone(),
            addresses,
            health: online(s.online),
        });
        edges.push(Edge {
            id: format!("peer:{id}"),
            kind: EdgeKind::Peer,
            from: "hub".into(),
            to: id,
            health: Some(online(s.online)),
        });
    }

    for c in &t.clients {
        let id = format!("client:{}", c.client_id);
        nodes.push(Node {
            id: id.clone(),
            kind: NodeKind::Client,
            name: c.name.clone(),
            addresses: c.subnet.clone().into_iter().collect(),
            health: online(c.online),
        });
        // Clients peer with the site(s) they connect through; the hub is the
        // fallback when the association is empty (Phase 0 finding 6).
        if c.sites.is_empty() {
            edges.push(Edge {
                id: format!("peer:{id}:hub"),
                kind: EdgeKind::Peer,
                from: id.clone(),
                to: "hub".into(),
                health: Some(online(c.online)),
            });
        } else {
            for sref in &c.sites {
                edges.push(Edge {
                    id: format!("peer:{id}:site:{}", sref.site_id),
                    kind: EdgeKind::Peer,
                    from: id.clone(),
                    to: format!("site:{}", sref.site_id),
                    health: Some(online(c.online)),
                });
            }
        }
    }

    for sr in &t.site_resources {
        let id = format!("sr:{}", sr.site_resource_id);
        let mut addresses = Vec::new();
        if let Some(a) = &sr.alias {
            addresses.push(a.clone());
        }
        if let Some(aa) = &sr.alias_address {
            addresses.push(aa.clone());
        }
        if let (Some(d), Some(p)) = (&sr.destination, sr.destination_port) {
            addresses.push(format!("{d}:{p}"));
        }
        nodes.push(Node {
            id: id.clone(),
            kind: NodeKind::Resource,
            name: sr.name.clone(),
            addresses,
            health: online(sr.enabled),
        });
        for site_id in &sr.site_ids {
            edges.push(Edge {
                id: format!("serves:site:{site_id}:{id}"),
                kind: EdgeKind::Serves,
                from: format!("site:{site_id}"),
                to: id.clone(),
                health: None,
            });
        }
    }

    for g in &t.grants {
        edges.push(Edge {
            id: format!("grant:client:{}:sr:{}", g.client_id, g.site_resource_id),
            kind: EdgeKind::Grant,
            from: format!("client:{}", g.client_id),
            to: format!("sr:{}", g.site_resource_id),
            health: None,
        });
    }

    GraphModel { nodes, edges }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::collect::{FixtureTopology, TopologyCollector};
    use crate::model::EdgeKind;

    fn model() -> GraphModel {
        let t = FixtureTopology::new(concat!(env!("CARGO_MANIFEST_DIR"), "/fixtures/pangolin"))
            .collect()
            .unwrap();
        assemble(&t)
    }

    #[test]
    fn assembles_the_seeded_topology() {
        let m = model();
        // 1 hub + 2 sites + 3 clients + 4 site-resources.
        assert_eq!(m.nodes.len(), 10);
        let count = |k: EdgeKind| m.edges.iter().filter(|e| e.kind == k).count();
        // peers: 2 hub-site + 4 client-site (grants created site
        // associations for every client: w1->[1], w2->[1,2], w3->[2]).
        assert_eq!(count(EdgeKind::Peer), 6);
        assert_eq!(count(EdgeKind::Serves), 4);
        assert_eq!(count(EdgeKind::Grant), 6);
    }

    #[test]
    fn online_client_peers_with_its_site_not_the_hub() {
        let m = model();
        let e = m.edges.iter().find(|e| e.id == "peer:client:1:site:1").expect("edge exists");
        assert_eq!(e.from, "client:1");
        assert_eq!(e.to, "site:1");
        assert!(e.health.as_ref().unwrap().online);
        assert!(!m.edges.iter().any(|e| e.id == "peer:client:1:hub"));
    }

    #[test]
    fn every_edge_endpoint_is_a_node() {
        let m = model();
        let ids: std::collections::HashSet<_> = m.nodes.iter().map(|n| n.id.as_str()).collect();
        for e in &m.edges {
            assert!(ids.contains(e.from.as_str()), "dangling from: {}", e.id);
            assert!(ids.contains(e.to.as_str()), "dangling to: {}", e.id);
        }
    }

    #[test]
    fn serialized_model_uses_the_wire_contract() {
        let json = serde_json::to_value(model()).unwrap();
        let nodes = json["nodes"].as_array().unwrap();
        assert!(nodes.iter().any(|n| n["kind"] == "resource" && n["health"]["online"] == true));
    }
}
