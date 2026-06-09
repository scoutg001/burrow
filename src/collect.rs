//! Raw Pangolin integration-API shapes and the collector seam.
//!
//! The serde structs here are written against the captured fixtures in
//! fixtures/pangolin/ (real responses from a live Community stack); only the
//! fields Burrow uses are declared, everything else is ignored. The
//! `TopologyCollector` trait is the test seam: `FixtureTopology` feeds the
//! same bytes the HTTP collector would, with no network.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::Deserialize;

/// Every integration-API response wraps its payload in this envelope.
#[derive(Debug, Deserialize)]
pub struct Envelope<T> {
    pub data: T,
}

#[derive(Debug, Deserialize)]
pub struct Pagination {
    pub total: u64,
    #[serde(rename = "pageSize")]
    pub page_size: u64,
    pub page: u64,
}

#[derive(Debug, Deserialize)]
pub struct OrgData {
    pub org: Org,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Org {
    pub org_id: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct SitesPage {
    pub sites: Vec<Site>,
    pub pagination: Pagination,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Site {
    pub site_id: i64,
    pub name: String,
    /// WireGuard public key; equals the `peer` label on gerbil's metrics.
    pub pub_key: Option<String>,
    pub subnet: Option<String>,
    pub address: Option<String>,
    pub online: bool,
    pub megabytes_in: Option<f64>,
    pub megabytes_out: Option<f64>,
    #[serde(rename = "type")]
    pub site_type: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ClientsPage {
    pub clients: Vec<Client>,
    pub pagination: Pagination,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientSiteRef {
    pub site_id: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Client {
    pub client_id: i64,
    pub name: String,
    pub pub_key: Option<String>,
    pub subnet: Option<String>,
    pub online: bool,
    pub megabytes_in: Option<f64>,
    pub megabytes_out: Option<f64>,
    /// The site(s) this client connects through. Olm clients peer with
    /// sites, not the hub (Phase 0 finding 6).
    #[serde(default)]
    pub sites: Vec<ClientSiteRef>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteResourcesPage {
    pub site_resources: Vec<SiteResource>,
    pub pagination: Pagination,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteResource {
    pub site_resource_id: i64,
    pub name: String,
    pub enabled: bool,
    pub alias: Option<String>,
    pub alias_address: Option<String>,
    pub destination: Option<String>,
    pub destination_port: Option<u16>,
    #[serde(default)]
    pub site_ids: Vec<i64>,
}

#[derive(Debug, Deserialize)]
pub struct GrantClientsData {
    pub clients: Vec<GrantClient>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrantClient {
    pub client_id: i64,
}

/// A client-to-site-resource grant edge, flattened.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Grant {
    pub site_resource_id: i64,
    pub client_id: i64,
}

/// Everything one poll of the topology source returns.
#[derive(Debug)]
pub struct Topology {
    pub org: Org,
    pub sites: Vec<Site>,
    pub clients: Vec<Client>,
    pub site_resources: Vec<SiteResource>,
    pub grants: Vec<Grant>,
}

pub trait TopologyCollector: Send {
    fn collect(&self) -> Result<Topology>;
}

/// Fixture-backed collector: reads the captured JSON files from a directory
/// laid out like fixtures/pangolin/. The test double for HttpTopologyCollector.
pub struct FixtureTopology {
    dir: PathBuf,
}

impl FixtureTopology {
    pub fn new(dir: impl AsRef<Path>) -> Self {
        Self { dir: dir.as_ref().to_path_buf() }
    }

    fn read<T: serde::de::DeserializeOwned>(&self, file: &str) -> Result<T> {
        let path = self.dir.join(file);
        let bytes = std::fs::read(&path).with_context(|| format!("reading {}", path.display()))?;
        let env: Envelope<T> =
            serde_json::from_slice(&bytes).with_context(|| format!("parsing {}", path.display()))?;
        Ok(env.data)
    }
}

impl TopologyCollector for FixtureTopology {
    fn collect(&self) -> Result<Topology> {
        let org: OrgData = self.read("org.json")?;
        let sites: SitesPage = self.read("sites.json")?;
        let clients: ClientsPage = self.read("clients.json")?;
        let srs: SiteResourcesPage = self.read("site-resources.json")?;
        let mut grants = Vec::new();
        for sr in &srs.site_resources {
            let file = format!("site-resource-{}-clients.json", sr.site_resource_id);
            if !self.dir.join(&file).exists() {
                continue;
            }
            let g: GrantClientsData = self.read(&file)?;
            for c in g.clients {
                grants.push(Grant { site_resource_id: sr.site_resource_id, client_id: c.client_id });
            }
        }
        Ok(Topology {
            org: org.org,
            sites: sites.sites,
            clients: clients.clients,
            site_resources: srs.site_resources,
            grants,
        })
    }
}

/// Stable ordering helper used by graph assembly and tests: grants grouped by
/// site-resource id, then client id.
pub fn sort_grants(grants: &mut [Grant]) {
    grants.sort_by_key(|g| (g.site_resource_id, g.client_id));
}

/// Index sites by id (assembly needs the lookups).
pub fn site_index(sites: &[Site]) -> BTreeMap<i64, &Site> {
    sites.iter().map(|s| (s.site_id, s)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixtures() -> FixtureTopology {
        FixtureTopology::new(concat!(env!("CARGO_MANIFEST_DIR"), "/fixtures/pangolin"))
    }

    #[test]
    fn deserializes_the_captured_fixtures() {
        let t = fixtures().collect().expect("fixtures parse");
        assert_eq!(t.org.org_id, "burrow-dev");
        assert_eq!(t.sites.len(), 2, "two seeded sites");
        assert_eq!(t.clients.len(), 3, "three seeded clients");
        assert_eq!(t.site_resources.len(), 4, "four seeded site-resources");
        // Seeded grants: alpha-ssh(1,2) alpha-print(1) bravo-ssh(2,3) bravo-cam(3).
        assert_eq!(t.grants.len(), 6, "six seeded grants");
    }

    #[test]
    fn sites_carry_the_join_key_and_online_state() {
        let t = fixtures().collect().unwrap();
        let alpha = t.sites.iter().find(|s| s.name == "den-alpha").unwrap();
        assert!(alpha.online);
        let key = alpha.pub_key.as_deref().unwrap();
        assert_eq!(key.len(), 44, "base64 WireGuard key: {key}");
    }

    #[test]
    fn clients_carry_their_connecting_sites() {
        let t = fixtures().collect().unwrap();
        let one = t.clients.iter().find(|c| c.name == "wanderer-one").unwrap();
        assert!(one.online, "the olm-backed client was online at capture time");
        assert_eq!(one.sites.len(), 1);
        assert_eq!(one.sites[0].site_id, 1);
    }
}
