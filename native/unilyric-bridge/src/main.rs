//! Transport adapter only. All Windows SMTC and cover access lives in UniLyric's engine.
use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::{Value, json};
use smtc_suite::{MediaCommand, MediaManager, MediaUpdate, RepeatMode, SmtcControlCommand};
use std::io::{self, Write};
use tokio::io::{AsyncBufReadExt, BufReader};
mod lyrics;

fn send(value: Value) -> io::Result<()> {
    let mut out = io::stdout().lock();
    serde_json::to_writer(&mut out, &value)?;
    writeln!(out)?;
    out.flush()
}

fn command(value: &Value) -> Result<MediaCommand, &'static str> {
    let action = value["command"].as_str().ok_or("Missing command")?;
    let control = match action {
        "refresh" => return Ok(MediaCommand::RequestUpdate),
        "select" => return Ok(MediaCommand::SelectSession(value["session"].as_str().ok_or("Missing session")?.into())),
        "shutdown" => return Ok(MediaCommand::Shutdown),
        "pause" => SmtcControlCommand::Pause,
        "resume" => SmtcControlCommand::Play,
        "forwardSong" => SmtcControlCommand::SkipNext,
        "backwardSong" => SmtcControlCommand::SkipPrevious,
        "seekPlayProgress" => SmtcControlCommand::SeekTo(value["progress"].as_u64().ok_or("Invalid position")?),
        "setShuffleMode" => SmtcControlCommand::SetShuffle(value["enabled"].as_bool().ok_or("Invalid shuffle")?),
        "setRepeatMode" => SmtcControlCommand::SetRepeatMode(match value["mode"].as_str() {
            Some("off") => RepeatMode::Off, Some("one") => RepeatMode::One, Some("all") => RepeatMode::All,
            _ => return Err("Invalid repeat mode"),
        }),
        _ => return Err("Unknown command"),
    };
    Ok(MediaCommand::Control(control))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    if std::env::args().any(|arg| arg == "--lyrics") {
        let result = lyrics::run().await;
        send(match result { Ok(data) => json!({"ok":true,"data":data}), Err(e) => json!({"ok":false,"error":e.to_string()}) })?;
        return Ok(());
    }
    let epoch = std::time::Instant::now();
    let (controller, mut updates) = MediaManager::start()?;
    // The UI interpolates on its own monotonic clock. No 16 ms bridge updates.
    controller.command_tx.send(MediaCommand::SetHighFrequencyProgressUpdates(false)).await?;
    controller.command_tx.send(MediaCommand::RequestUpdate).await?;
    let mut input = BufReader::new(tokio::io::stdin()).lines();
    loop {
        tokio::select! {
            line = input.next_line() => {
                let Some(line) = line? else { break };
                match serde_json::from_str::<Value>(&line).map_err(|e| e.to_string()).and_then(|v| command(&v).map_err(String::from)) {
                    Ok(MediaCommand::Shutdown) => break,
                    Ok(cmd) => controller.command_tx.send(cmd).await?,
                    Err(error) => send(json!({"type":"Error", "payload":error}))?,
                }
            }
            update = updates.recv() => {
                let Some(update) = update else { break };
                let mut value = serde_json::to_value(&update)?;
                if let MediaUpdate::TrackChanged(info) = &update {
                    value["payload"]["timeline_token"] = json!(info.position_report_time.map(|t| t.saturating_duration_since(epoch).as_nanos().to_string()));
                    value["payload"]["control_bits"] = json!(info.controls.unwrap_or_default().bits());
                    // Cover bytes are skipped by the upstream serde implementation; carry them explicitly.
                    value["payload"]["cover_base64"] = json!(info.cover_data.as_ref().map(|bytes| STANDARD.encode(bytes)));
                }
                send(value)?;
            }
        }
    }
    controller.shutdown().await?;
    Ok(())
}
