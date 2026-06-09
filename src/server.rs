//! HTTP surface: GET /graph (latest snapshot as JSON) plus static files from
//! the webroot. Thread per request, no async runtime; the structure follows
//! arm-gateway. SSE (/events) arrives in Phase 2.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;

use anyhow::{anyhow, Result};
use tiny_http::{Header, Method, Request, Response, Server};

use crate::model::GraphModel;

type Body = std::io::Cursor<Vec<u8>>;

/// The latest poll result, shared between the poll loop and the server.
pub type SharedGraph = Arc<Mutex<Option<GraphModel>>>;

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("valid header")
}

fn json_response(status: u16, body: String) -> Response<Body> {
    Response::from_data(body.into_bytes())
        .with_status_code(status)
        .with_header(header("Access-Control-Allow-Origin", "*"))
        .with_header(header("Content-Type", "application/json"))
}

fn text_response(status: u16, msg: &str) -> Response<Body> {
    Response::from_data(msg.as_bytes().to_vec())
        .with_status_code(status)
        .with_header(header("Content-Type", "text/plain; charset=utf-8"))
}

fn content_type(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()) {
        Some("html") => "text/html; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("js") => "text/javascript; charset=utf-8",
        Some("json") | Some("map") => "application/json",
        Some("svg") => "image/svg+xml",
        Some("ico") => "image/x-icon",
        _ => "application/octet-stream",
    }
}

/// Serve a file from the web root, with a path-traversal guard. A directory
/// maps to its index.html.
fn serve_static(webroot: &Option<PathBuf>, path: &str) -> Response<Body> {
    let Some(root) = webroot else {
        return text_response(404, "no web root configured");
    };
    let mut target = root.join(path.trim_start_matches('/'));
    if target.is_dir() {
        target = target.join("index.html");
    }
    let (Ok(canon_root), Ok(target)) = (root.canonicalize(), target.canonicalize()) else {
        return text_response(404, "not found");
    };
    if !target.starts_with(&canon_root) {
        return text_response(403, "forbidden");
    }
    match std::fs::read(&target) {
        Ok(bytes) => Response::from_data(bytes)
            .with_status_code(200)
            .with_header(header("Content-Type", content_type(&target))),
        Err(_) => text_response(404, "not found"),
    }
}

fn handle_request(req: Request, graph: &SharedGraph, webroot: &Option<PathBuf>) {
    let method = req.method().clone();
    let path = req.url().split('?').next().unwrap_or("/").to_string();

    let resp = match (&method, path.as_str()) {
        (Method::Get, "/graph") => match graph.lock().unwrap().as_ref() {
            Some(m) => json_response(200, serde_json::to_string(m).expect("model serializes")),
            None => json_response(503, r#"{"error":"no poll has succeeded yet"}"#.into()),
        },
        (Method::Get, "/healthz") => text_response(200, "ok"),
        (Method::Get, _) => serve_static(webroot, &path),
        _ => text_response(404, "not found"),
    };
    let _ = req.respond(resp);
}

/// Run the server forever, one thread per request.
pub fn serve(listen: &str, graph: SharedGraph, webroot: Option<PathBuf>) -> Result<()> {
    let server =
        Arc::new(Server::http(listen).map_err(|e| anyhow!("starting HTTP server on {listen}: {e}"))?);
    eprintln!(
        "burrow: http://{listen} (webroot: {})",
        webroot.as_deref().map(|p| p.display().to_string()).unwrap_or_else(|| "none".into())
    );
    for req in server.incoming_requests() {
        let graph = Arc::clone(&graph);
        let webroot = webroot.clone();
        thread::spawn(move || handle_request(req, &graph, &webroot));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::collect::{FixtureTopology, TopologyCollector};
    use crate::graph::assemble;
    use std::io::Read;
    use std::net::TcpListener;

    fn free_port() -> u16 {
        TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port()
    }

    fn http_get(addr: &str, path: &str) -> (u16, String) {
        use std::io::Write;
        let mut s = std::net::TcpStream::connect(addr).unwrap();
        write!(s, "GET {path} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n").unwrap();
        let mut buf = String::new();
        s.read_to_string(&mut buf).unwrap();
        let status: u16 = buf.split_whitespace().nth(1).unwrap().parse().unwrap();
        let body = buf.split("\r\n\r\n").nth(1).unwrap_or("").to_string();
        (status, body)
    }

    #[test]
    fn graph_endpoint_serves_the_assembled_fixture_model() {
        let t = FixtureTopology::new(concat!(env!("CARGO_MANIFEST_DIR"), "/fixtures/pangolin"))
            .collect()
            .unwrap();
        let model = assemble(&t);
        let graph: SharedGraph = Arc::new(Mutex::new(Some(model.clone())));
        let addr = format!("127.0.0.1:{}", free_port());
        {
            let graph = Arc::clone(&graph);
            let addr = addr.clone();
            thread::spawn(move || serve(&addr, graph, None));
        }
        thread::sleep(std::time::Duration::from_millis(150));

        let (status, body) = http_get(&addr, "/graph");
        assert_eq!(status, 200);
        let got: crate::model::GraphModel = serde_json::from_str(&body).unwrap();
        assert_eq!(got, model);

        let (status, body) = http_get(&addr, "/missing.html");
        assert_eq!(status, 404, "no webroot configured: {body}");
    }

    #[test]
    fn graph_endpoint_is_503_before_the_first_successful_poll() {
        let graph: SharedGraph = Arc::new(Mutex::new(None));
        let addr = format!("127.0.0.1:{}", free_port());
        {
            let graph = Arc::clone(&graph);
            let addr = addr.clone();
            thread::spawn(move || serve(&addr, graph, None));
        }
        thread::sleep(std::time::Duration::from_millis(150));
        let (status, _) = http_get(&addr, "/graph");
        assert_eq!(status, 503);
    }
}
