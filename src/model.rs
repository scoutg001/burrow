//! The graph model: what `GET /graph` serializes and the web page renders.
//! Pure data, serde only. The TypeScript mirror lives in web/src/types.ts;
//! keep the two in sync by hand.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NodeKind {
    Hub,
    Site,
    Client,
    Resource,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EdgeKind {
    Peer,
    Serves,
    Grant,
}

/// Health block, filled in progressively by phase (P1 sets only `online`).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Health {
    pub online: bool,
    pub handshake_age_sec: Option<f64>,
    pub rtt_ms: Option<f64>,
    pub bytes_in_per_sec: Option<f64>,
    pub bytes_out_per_sec: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub id: String,
    pub kind: NodeKind,
    pub name: String,
    /// Human-readable addresses for the detail panel: tunnel IPs, subnets,
    /// aliases, destination host:port. Whatever the entity has.
    pub addresses: Vec<String>,
    pub health: Health,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Edge {
    pub id: String,
    pub kind: EdgeKind,
    pub from: String,
    pub to: String,
    /// Present on `peer` edges (the links that carry health); None on the
    /// structural `serves` / `grant` edges.
    pub health: Option<Health>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphModel {
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_through_json_with_camel_case_wire_names() {
        let model = GraphModel {
            nodes: vec![Node {
                id: "site:1".into(),
                kind: NodeKind::Site,
                name: "den-alpha".into(),
                addresses: vec!["100.89.128.8/30".into()],
                health: Health { online: true, ..Default::default() },
            }],
            edges: vec![Edge {
                id: "peer:site:1".into(),
                kind: EdgeKind::Peer,
                from: "hub".into(),
                to: "site:1".into(),
                health: Some(Health::default()),
            }],
        };
        let json = serde_json::to_string(&model).unwrap();
        assert!(json.contains("\"handshakeAgeSec\""), "wire names are camelCase: {json}");
        assert!(json.contains("\"kind\":\"site\""));
        let back: GraphModel = serde_json::from_str(&json).unwrap();
        assert_eq!(model, back);
    }
}
