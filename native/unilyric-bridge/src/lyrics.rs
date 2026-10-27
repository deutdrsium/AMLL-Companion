use lyrics_helper_lite::providers::{get_provider, RequestInfo, RequestBodyFormat, TrackQuery};
use lyrics_helper_core::{SearchResult, ParsedSourceData, ContentType};
use serde_json::{json, Value};
use std::io::Read;
use base64::Engine;

async fn catalogue(input: &Value) -> Result<Value, Box<dyn std::error::Error>> {
    let provider = input["provider"].as_str().ok_or("Missing provider")?;
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none()).build()?;
    let data = &input["data"];
    if input["operation"] == "search" {
        let query: TrackQuery = serde_json::from_value(data.clone())?;
        let keyword = format!("{} {}", query.title, query.artists.join(" "));
        let response = if provider == "kuwo" {
            client.get("https://search.kuwo.cn/r.s").query(&[("all",keyword.as_str()),("ft","music"),
                ("client","kt"),("pn","0"),("rn","30"),("rformat","json"),("encoding","utf8"),
                ("mobi","1"),("vipver","MUSIC_9.1.1.2_BCS2"),("show_copyright_off","1"),("newver","1")])
        } else {
            client.get("https://app.u.nf.migu.cn/pc/resource/song/item/search/v1.0")
                .query(&[("text",keyword.as_str()),("pageNo","1"),("pageSize","30")])
        }.send().await?.error_for_status()?.text().await?;
        let result: Value = serde_json::from_str(&response)?;
        let rows = if provider == "kuwo" { &result["abslist"] } else { &result };
        let rows = rows.as_array().ok_or("Invalid catalogue response")?;
        let items: Vec<Value> = rows.iter().map(|r| if provider == "kuwo" {
            json!({"provider_name":provider,"provider_id":r["MUSICRID"].as_str().unwrap_or_default().trim_start_matches("MUSIC_"),
                "title":r["SONGNAME"],"artists":r["ARTIST"].as_str().unwrap_or_default().split('&').map(|name|json!({"name":name})).collect::<Vec<_>>(),
                "album":r["ALBUM"],"duration":r["DURATION"].as_str().and_then(|s|s.parse::<u64>().ok()).unwrap_or(0)*1000})
        } else {
            json!({"provider_name":provider,"provider_id":r["copyrightId"],"title":r["songName"],
                "artists":r["singerList"],"album":r["album"],"duration":r["duration"].as_u64().unwrap_or(0)*1000,
                "lyric_url":r["ext"]["lrcUrl"],"translation_url":r["ext"]["trcUrl"]})
        }).collect();
        return Ok(json!(items));
    }
    if input["operation"] != "get" { return Err("Unknown operation".into()); }
    let text = if provider == "kuwo" {
        let id = data["provider_id"].as_str().ok_or("Missing music id")?;
        if id.is_empty() || !id.chars().all(|c|c.is_ascii_digit()) { return Err("Invalid music id".into()); }
        let text = client.get("https://www.kuwo.cn/openapi/v1/www/lyric/getlyric")
            .header("Referer","https://www.kuwo.cn/").query(&[("musicId",id)])
            .send().await?.error_for_status()?.text().await?;
        let result: Value = serde_json::from_str(&text)?;
        let rows = result["data"]["lrclist"].as_array().ok_or("酷我此版本没有歌词")?;
        rows.iter().filter_map(|r| {
            let time = r["time"].as_str()?.parse::<f64>().ok()?;
            if !time.is_finite() || time < 0.0 { return None; }
            Some(format!("[{:02}:{:05.2}]{}",(time/60.0) as u64,time%60.0,r["lineLyric"].as_str()?))
        }).collect::<Vec<_>>().join("\n")
    } else {
        migu_text(&client, data["lyric_url"].as_str().ok_or("咪咕此版本没有歌词")?).await?
    };
    let mut parsed = lyrics_helper_lite::parser::parse_lrc(&text)?;
    if provider == "migu" {
        if let Some(url) = data["translation_url"].as_str().filter(|s|!s.is_empty()) {
            if let Ok(text) = migu_text(&client,url).await {
                if let Ok(translation) = lyrics_helper_lite::parser::parse_lrc(&text) {
                    parsed.lines = lyrics_helper_lite::parser::merge_lyric_lines(parsed.lines,Some(translation.lines),None);
                }
            }
        }
    }
    Ok(amll(parsed))
}

async fn migu_text(client: &reqwest::Client, url: &str) -> Result<String, Box<dyn std::error::Error>> {
    let url = reqwest::Url::parse(url)?;
    if url.scheme() != "https" || url.host_str() != Some("d.musicapp.migu.cn") || !url.username().is_empty()
        || url.port().is_some() { return Err("Invalid Migu lyric URL".into()); }
    Ok(client.get(url).send().await?.error_for_status()?.text().await?)
}

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
    // Anonymous desktop SearchCgiService can return code 2001; use the public catalogue endpoint.
    if info.url == "https://u.y.qq.com/cgi-bin/musicu.fcg" {
        let body: Value = serde_json::from_str(info.body.as_deref().ok_or("Missing search body")?)?;
        let keyword = body["req_1"]["param"]["query"].as_str().ok_or("Missing query")?;
        let text = client.get("https://c.y.qq.com/soso/fcgi-bin/search_for_qq_cp")
            .header("Referer","https://y.qq.com/").header("User-Agent","Mozilla/5.0")
            .query(&[("format","json"),("w",keyword),("p","1"),("n","30")])
            .send().await?.error_for_status()?.text().await?;
        let response: Value = serde_json::from_str(&text)?;
        if response["code"] != 0 { return Err("QQ 搜索暂不可用".into()); }
        let rows = response["data"]["song"]["list"].as_array().ok_or("Invalid QQ catalogue")?;
        let list: Vec<Value> = rows.iter().map(|r|json!({"id":r["songid"],"mid":r["songmid"],
            "name":r["songname"],"singer":r["singer"],"interval":r["interval"],
            "album":{"name":r["albumname"],"mid":r["albummid"]}})).collect();
        return Ok(json!({"code":0,"req_1":{"code":0,"data":{"body":{"song":{"list":list}}}}}).to_string());
    }
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
    if input["provider"] == "kuwo" || input["provider"] == "migu" { return catalogue(&input).await; }
    let provider = get_provider(input["provider"].as_str().ok_or("Missing provider")?)?;
    match input["operation"].as_str() {
        Some("search") => {
            let query: TrackQuery = serde_json::from_value(input["data"].clone())?;
            let text = request(provider.prepare_search_request(&query)?).await?;
            Ok(serde_json::to_value(provider.handle_search_response(&text, &query)?)?)
        }
        Some("get") => {
            let song: SearchResult = serde_json::from_value(input["data"].clone())?;
            let result = async {
                let text = request(provider.prepare_lyrics_request(&song)?).await?;
                Ok::<_,Box<dyn std::error::Error>>(amll(provider.handle_lyrics_response(&text)?))
            }.await;
            if result.is_ok() || input["provider"] != "qq" { return result; }
            let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(8)).build()?;
            let text = client.get("https://i.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg")
                .header("Referer","https://y.qq.com/").query(&[("songmid",song.provider_id.as_str()),
                    ("g_tk","5381"),("format","json"),("inCharset","utf8"),("outCharset","utf-8"),("nobase64","1")])
                .send().await?.error_for_status()?.text().await?;
            let data: Value = serde_json::from_str(&text)?;
            let mut parsed = lyrics_helper_lite::parser::parse_lrc(data["lyric"].as_str().ok_or("QQ 此版本没有歌词")?)?;
            let translated = data["trans"].as_str().and_then(|s|lyrics_helper_lite::parser::parse_lrc(s).ok());
            parsed.lines = lyrics_helper_lite::parser::merge_lyric_lines(parsed.lines,translated.map(|p|p.lines),None);
            Ok(amll(parsed))
        }
        _ => Err("Unknown operation".into()),
    }
}
