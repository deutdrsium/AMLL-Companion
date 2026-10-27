use lyrics_helper_lite::providers::{get_provider, RequestInfo, RequestBodyFormat, TrackQuery};
use lyrics_helper_core::{SearchResult, ParsedSourceData, ContentType};
use serde_json::{json, Value};
use std::io::Read;
use base64::Engine;

async fn kugou(input: &Value) -> Result<Value, Box<dyn std::error::Error>> {
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(10)).build()?;
    let data = &input["data"];
    if input["operation"] == "search" {
        let query: TrackQuery = serde_json::from_value(data.clone())?;
        let keyword = format!("{} {}", query.title, query.artists.join(" "));
        let result: Value = serde_json::from_str(&client.get("https://mobileservice.kugou.com/api/v3/search/song")
            .query(&[("keyword",keyword.as_str()),("pagesize","30"),("page","1"),("format","json")])
            .send().await?.error_for_status()?.text().await?)?;
        if result["status"] != 1 { return Err("酷狗搜索暂不可用".into()); }
        let rows = result["data"]["info"].as_array().ok_or("Invalid Kugou search response")?;
        let mut items = Vec::new();
        for item in rows.iter().flat_map(|r| std::iter::once(r).chain(r["group"].as_array().into_iter().flatten())) {
            if let (Some(hash),Some(title),Some(artist),Some(duration)) = (item["hash"].as_str(),item["songname"].as_str(),item["singername"].as_str(),item["duration"].as_u64()) {
                items.push(json!({"provider_name":"kugou","provider_id":hash,"title":title,
                    "artists":artist.split('、').map(|name|json!({"name":name})).collect::<Vec<_>>(),
                    "album":item["album_name"],"duration":duration*1000}));
            }
        }
        return Ok(json!(items));
    }
    if input["operation"] != "get" { return Err("Unknown operation".into()); }
    let hash = data["provider_id"].as_str().ok_or("Missing hash")?;
    if hash.len()!=32 || !hash.chars().all(|c|c.is_ascii_hexdigit()) { return Err("Invalid hash".into()); }
    let search: Value = serde_json::from_str(&client.get("https://lyrics.kugou.com/search")
        .query(&[("ver","1"),("man","yes"),("client","pc"),("keyword",""),("hash",hash)])
        .send().await?.error_for_status()?.text().await?)?;
    let candidate = search["candidates"].as_array().and_then(|v|v.first()).ok_or("酷狗此版本没有歌词")?;
    let download: Value = serde_json::from_str(&client.get("https://lyrics.kugou.com/download")
        .query(&[("ver","1"),("client","pc"),("id",candidate["id"].as_str().ok_or("Missing lyric id")?),
            ("accesskey",candidate["accesskey"].as_str().ok_or("Missing lyric key")?),("fmt","lrc"),("charset","utf8")])
        .send().await?.error_for_status()?.text().await?)?;
    let text = String::from_utf8(base64::engine::general_purpose::STANDARD.decode(download["content"].as_str().ok_or("Missing lyrics")?)?)?;
    Ok(amll(lyrics_helper_lite::parser::parse_lrc(&text)?))
}

async fn request(info: RequestInfo) -> Result<String, Box<dyn std::error::Error>> {
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(12)).build()?;
    let mut request = client.request(info.method.parse()?, &info.url)
        .header("User-Agent", "Mozilla/5.0")
        .header("Referer", if info.url.contains("qq.com") {"https://y.qq.com/"} else {"https://music.163.com/"});
    if let Some(headers) = info.headers { for (key, value) in headers { request = request.header(key, value); } }
    if let Some(body) = info.body {
        request = request.header("Content-Type", match info.body_format {
            RequestBodyFormat::Json => "application/json",
            RequestBodyFormat::UrlEncodedForm => "application/x-www-form-urlencoded",
        }).body(body);
    }
    Ok(request.send().await?.error_for_status()?.text().await?)
}

fn amll(data: ParsedSourceData) -> Value {
    let mut lines = Vec::new();
    for line in data.lines {
        for track in line.tracks {
            let words: Vec<Value> = track.content.syllables().map(|s| json!({
                "word":format!("{}{}",s.text,if s.ends_with_space {" "} else {""}),
                "startTime":s.start_ms,"endTime":s.end_ms,
            })).collect();
            if words.is_empty() { continue; }
            lines.push(json!({"startTime":line.start_ms,"endTime":line.end_ms,"words":words,
                "translatedLyric":track.translations.first().map(|t|t.text()).unwrap_or_default(),
                "romanLyric":track.romanizations.first().map(|t|t.text()).unwrap_or_default(),
                "isBG":track.content_type==ContentType::Background,"isDuet":false}));
        }
    }
    json!({"lines":lines,"lineTimed":data.is_line_timed_source})
}

pub async fn run() -> Result<Value, Box<dyn std::error::Error>> {
    let mut input = String::new();
    std::io::stdin().take(100_000).read_to_string(&mut input)?;
    let input: Value = serde_json::from_str(&input)?;
    if input["provider"] == "kugou" { return kugou(&input).await; }
    let provider = get_provider(input["provider"].as_str().ok_or("Missing provider")?)?;
    match input["operation"].as_str() {
        Some("search") => {
            let query: TrackQuery = serde_json::from_value(input["data"].clone())?;
            let text = request(provider.prepare_search_request(&query)?).await?;
            Ok(serde_json::to_value(provider.handle_search_response(&text, &query)?)?)
        }
        Some("get") => {
            let song: SearchResult = serde_json::from_value(input["data"].clone())?;
            let text = request(provider.prepare_lyrics_request(&song)?).await?;
            Ok(amll(provider.handle_lyrics_response(&text)?))
        }
        _ => Err("Unknown operation".into()),
    }
}
