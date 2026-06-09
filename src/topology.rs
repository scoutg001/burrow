//! The real topology source: Pangolin's integration API over HTTP.
//!
//! Auth is `Authorization: Bearer <apiKeyId>.<apiKeySecret>` (Phase 0
//! finding 1). List endpoints are paginated (pageSize/page, default 20);
//! this collector pages until it has everything.

use anyhow::{Context, Result};
use serde::de::DeserializeOwned;

use crate::collect::{
    ClientsPage, Envelope, Grant, GrantClientsData, OrgData, SiteResourcesPage, SitesPage,
    Topology, TopologyCollector,
};

const PAGE_SIZE: u64 = 100;

pub struct HttpTopologyCollector {
    base_url: String,
    token: String,
    org_id: String,
    agent: ureq::Agent,
}

impl HttpTopologyCollector {
    pub fn new(base_url: &str, token: &str, org_id: &str) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            token: token.to_string(),
            org_id: org_id.to_string(),
            agent: ureq::AgentBuilder::new()
                .timeout(std::time::Duration::from_secs(10))
                .build(),
        }
    }

    fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T> {
        let url = format!("{}{}", self.base_url, path);
        let resp = self
            .agent
            .get(&url)
            .set("Authorization", &format!("Bearer {}", self.token))
            .call()
            .with_context(|| format!("GET {url}"))?;
        let env: Envelope<T> = resp
            .into_json()
            .with_context(|| format!("parsing response of GET {url}"))?;
        Ok(env.data)
    }

    /// Fetch every page of a paginated list endpoint.
    fn get_all_pages<P, T>(&self, path: &str, items: impl Fn(P) -> (Vec<T>, u64)) -> Result<Vec<T>>
    where
        P: DeserializeOwned,
    {
        let mut all = Vec::new();
        let mut page = 1u64;
        loop {
            let p: P = self.get(&format!("{path}?pageSize={PAGE_SIZE}&page={page}"))?;
            let (mut batch, total) = items(p);
            all.append(&mut batch);
            if all.len() as u64 >= total {
                return Ok(all);
            }
            page += 1;
        }
    }
}

impl TopologyCollector for HttpTopologyCollector {
    fn collect(&self) -> Result<Topology> {
        let org: OrgData = self.get(&format!("/org/{}", self.org_id))?;
        let sites = self.get_all_pages(&format!("/org/{}/sites", self.org_id), |p: SitesPage| {
            let total = p.pagination.total;
            (p.sites, total)
        })?;
        let clients =
            self.get_all_pages(&format!("/org/{}/clients", self.org_id), |p: ClientsPage| {
                let total = p.pagination.total;
                (p.clients, total)
            })?;
        let site_resources = self.get_all_pages(
            &format!("/org/{}/site-resources", self.org_id),
            |p: SiteResourcesPage| {
                let total = p.pagination.total;
                (p.site_resources, total)
            },
        )?;
        let mut grants = Vec::new();
        for sr in &site_resources {
            let g: GrantClientsData =
                self.get(&format!("/site-resource/{}/clients", sr.site_resource_id))?;
            for c in g.clients {
                grants.push(Grant {
                    site_resource_id: sr.site_resource_id,
                    client_id: c.client_id,
                });
            }
        }
        Ok(Topology { org: org.org, sites, clients, site_resources, grants })
    }
}
