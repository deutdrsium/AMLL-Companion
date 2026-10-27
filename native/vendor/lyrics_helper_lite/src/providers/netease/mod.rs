mod crypto;
mod models;

use self::models::LyricApiResponse;
use crate::error::{FetcherError, Result};
use crate::parser::{merge_lyric_lines, parse_lrc, parse_yrc};
use crate::providers::{
    LyricProvider, RequestBodyFormat, RequestInfo, TrackQuery, checked_json_parser,
};
use crate::search::matcher::sort_and_rate_results;
use lyrics_helper_core::ParsedSourceData;
use lyrics_helper_core::{MatchType, SearchResult, model::generic::Artist as CoreArtist};
use serde_json::json;

const SEARCH_CLOUDSEARCH_PC_PATH: &str = "/api/cloudsearch/pc";
const SEARCH_CLOUDSEARCH_PC_URL: &str = "https://interface.music.163.com/eapi/cloudsearch/pc";

const SONG_LYRIC_V1_PATH: &str = "/api/song/lyric/v1";
const SONG_LYRIC_V1_URL: &str = "https://interface3.music.163.com/eapi/song/lyric/v1";

pub struct NeteaseProvider;

impl LyricProvider for NeteaseProvider {
    fn prepare_search_request(&self, query: &TrackQuery) -> Result<RequestInfo> {
        let keyword = format!("{} {}", query.title, query.artists.join(" "));

        let payload = json!({
            "s": keyword,
            "type": "1",
            "limit": 30,
            "offset": 0,
            "total": true
        });

        let encrypted_params = crypto::prepare_eapi_params(SEARCH_CLOUDSEARCH_PC_PATH, &payload)?;

        Ok(RequestInfo {
            url: SEARCH_CLOUDSEARCH_PC_URL.to_string(),
            method: "POST".to_string(),
            headers: None,
            body: Some(format!("params={encrypted_params}")),
            body_format: RequestBodyFormat::UrlEncodedForm,
        })
    }

    fn handle_search_response(
        &self,
        response_text: &str,
        query: &TrackQuery,
    ) -> Result<Vec<SearchResult>> {
        let api_response: models::SearchResultData =
            checked_json_parser(response_text, 200, &["result"])?;

        let candidates = api_response
            .songs
            .into_iter()
            .map(|item| {
                let artists = item
                    .artists
                    .into_iter()
                    .map(|a| CoreArtist {
                        id: a.id.to_string(),
                        name: a.name,
                    })
                    .collect();
                SearchResult {
                    title: item.name,
                    artists,
                    album: Some(item.album.name),
                    album_id: Some(item.album.id.to_string()),
                    duration: Some(item.duration),
                    provider_id: item.id.to_string(),
                    provider_name: "netease".to_string(),
                    provider_id_num: Some(item.id),
                    cover_url: item.album.pic_url,
                    match_type: MatchType::None,
                    language: None,
                }
            })
            .collect();

        let sorted_results = query.with_track(|track| sort_and_rate_results(&track, candidates));

        Ok(sorted_results)
    }

    fn prepare_lyrics_request(&self, search_result: &SearchResult) -> Result<RequestInfo> {
        let song_id = &search_result.provider_id;

        let payload = json!({
            "id": song_id,
            "cp": "false",
            "lv": "0",
            "kv": "0",
            "tv": "0",
            "rv": "0",
            "yv": "0",
            "ytv": "0",
            "yrv": "0",
            "csrf_token": ""
        });

        let encrypted_params = crypto::prepare_eapi_params(SONG_LYRIC_V1_PATH, &payload)?;

        Ok(RequestInfo {
            url: SONG_LYRIC_V1_URL.to_string(),
            method: "POST".to_string(),
            headers: None,
            body: Some(format!("params={encrypted_params}")),
            body_format: RequestBodyFormat::UrlEncodedForm,
        })
    }

    fn handle_lyrics_response(&self, response_text: &str) -> Result<ParsedSourceData> {
        let api_response: LyricApiResponse = checked_json_parser(response_text, 200, &[])?;

        let main_parsed_result = api_response
            .yrc
            .as_ref()
            .and_then(|y| y.lyric.as_ref())
            .filter(|s| !s.is_empty())
            .map(|content| parse_yrc(content))
            .or_else(|| {
                api_response
                    .lrc
                    .as_ref()
                    .and_then(|l| l.lyric.as_ref())
                    .filter(|s| !s.is_empty())
                    .map(|content| parse_lrc(content))
            })
            .ok_or_else(|| FetcherError::Provider("Lyric not found in API response".to_string()))?;

        let mut main_parsed = main_parsed_result?;
        let uses_yrc = !main_parsed.is_line_timed_source;

        // YRC and LRC have different line boundaries and timestamp grids.
        let select_annotation = |classic: Option<models::LyricData>, aligned: Option<models::LyricData>| {
            let classic = classic.and_then(|l| l.lyric).filter(|s| !s.trim().is_empty());
            let aligned = aligned.and_then(|l| l.lyric).filter(|s| !s.trim().is_empty());
            if uses_yrc { aligned.or(classic) } else { classic }
        };
        let translation_content = select_annotation(api_response.tlyric, api_response.ytlrc);
        let romanization_content = select_annotation(api_response.romalrc, api_response.yromalrc);

        let translation_lines = translation_content
            .map(|t| parse_lrc(&t).map(|p| p.lines))
            .transpose()?;

        let romanization_lines = romanization_content
            .map(|r| parse_lrc(&r).map(|p| p.lines))
            .transpose()?;

        let merged_lines =
            merge_lyric_lines(main_parsed.lines, translation_lines, romanization_lines);
        main_parsed.lines = merged_lines;

        main_parsed.source_name = "netease".to_string();

        Ok(main_parsed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn yrc_uses_its_own_translation_and_romanization_grid() {
        let response = json!({"code":200,
            "yrc":{"lyric":"[15270,7410](15270,400,0)alpha(15670,400,0) beta\n[22680,7550](22680,400,0)gamma(23080,400,0) delta"},
            "lrc":{"lyric":"[00:15.243]alpha\n[00:22.421]beta\n[00:28.520]gamma\n[00:30.102]delta"},
            "tlyric":{"lyric":"[00:15.243]old one\n[00:22.421]old two\n[00:28.520]old three"},
            "romalrc":{"lyric":"[00:15.243]old roman one\n[00:22.421]old roman two"},
            "ytlrc":{"lyric":"[00:15.270]aligned one\n[00:22.680]aligned two"},
            "yromalrc":{"lyric":"[00:15.270]roman one\n[00:22.680]roman two"}
        });
        let parsed = NeteaseProvider.handle_lyrics_response(&response.to_string()).unwrap();
        assert!(!parsed.is_line_timed_source);
        assert_eq!(parsed.lines.len(), 2);
        for (index, line) in parsed.lines.iter().enumerate() {
            let track = &line.tracks[0];
            assert_eq!(track.translations[0].text(), if index==0 {"aligned one"} else {"aligned two"});
            assert_eq!(track.romanizations[0].text(), if index==0 {"roman one"} else {"roman two"});
        }
    }

    #[test]
    fn lrc_keeps_classic_annotations_even_if_yrc_annotations_exist() {
        let response = json!({"code":200,
            "lrc":{"lyric":"[00:01.000]first\n[00:02.000]second"},
            "tlyric":{"lyric":"[00:01.000]classic translation"},
            "romalrc":{"lyric":"[00:01.000]classic roman"},
            "ytlrc":{"lyric":"[00:01.000]wrong grid translation"},
            "yromalrc":{"lyric":"[00:01.000]wrong grid roman"}
        });
        let parsed = NeteaseProvider.handle_lyrics_response(&response.to_string()).unwrap();
        assert!(parsed.is_line_timed_source);
        assert_eq!(parsed.lines[0].tracks[0].translations[0].text(), "classic translation");
        assert_eq!(parsed.lines[0].tracks[0].romanizations[0].text(), "classic roman");
    }

    #[test]
    fn absent_or_empty_yrc_annotations_fall_back_independently() {
        let response = json!({"code":200,
            "yrc":{"lyric":"[1000,1000](1000,500,0)first(1500,500,0) word"},
            "tlyric":{"lyric":"[00:01.000]classic translation"},
            "romalrc":{"lyric":"[00:01.000]classic roman"},
            "ytlrc":{"lyric":" "}
        });
        let parsed = NeteaseProvider.handle_lyrics_response(&response.to_string()).unwrap();
        assert_eq!(parsed.lines[0].tracks[0].translations[0].text(), "classic translation");
        assert_eq!(parsed.lines[0].tracks[0].romanizations[0].text(), "classic roman");
    }
}
