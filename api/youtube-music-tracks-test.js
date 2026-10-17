import { Innertube } from "youtubei.js";

export default async function handler(req, res) {
  try {
    const videoId =
      req.query?.videoId || "";

    if (!videoId) {
      return res.status(400).json({
        success: false,
        error: "videoId가 없습니다."
      });
    }

    const youtube =
      await Innertube.create({
        lang: "ko",
        location: "KR"
      });

    const info =
      await youtube.getInfo(
        videoId,
        "YTMUSIC"
      );

    let musicTracks = null;
    let getterError = "";

    try {
      musicTracks =
        info.music_tracks;
    } catch (error) {
      getterError =
        error?.message || "";
    }

    return res.status(200).json({
      success: true,

      videoId,

      musicTracksType:
        Array.isArray(musicTracks)
          ? "array"
          : typeof musicTracks,

      musicTrackCount:
        Array.isArray(musicTracks)
          ? musicTracks.length
          : 0,

      musicTracks:
        Array.isArray(musicTracks)
          ? musicTracks
          : null,

      getterError,

      pageKeys:
        Array.isArray(info?.page)
          ? info.page.map(
              (item, index) => ({
                index,
                type:
                  item?.constructor?.name ||
                  typeof item,
                keys:
                  item &&
                  typeof item === "object"
                    ? Object.keys(item).slice(
                        0,
                        30
                      )
                    : []
              })
            )
          : [],

      infoKeys:
        Object.keys(info || {})
    });

  } catch (error) {

    console.error(
      "YouTube Music tracks test error:",
      error
    );

    return res.status(500).json({
      success: false,

      error:
        error?.message ||
        "YouTube Music tracks를 가져오지 못했습니다.",

      stack:
        error?.stack || ""
    });
  }
}
