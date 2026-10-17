import { Innertube } from "youtubei.js";

export default async function handler(req, res) {
  try {
    const videoId =
      req.query?.videoId || "";

    if (!videoId) {
      return res.status(400).json({
        success: false,
        error: "videoId가 없습니다.",
        example: "/api/youtube-music-test?videoId=유튜브영상ID"
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

    const basic =
      info?.basic_info || {};

    const title =
      basic.title || "";

    const duration =
      basic.duration || 0;

    const author =
      basic.author || "";

    const channelId =
      basic.channel_id || "";

    let artists = [];

    if (
      Array.isArray(
        basic.author
      )
    ) {
      artists =
        basic.author;
    }

    return res.status(200).json({
      success: true,

      videoId,

      title,

      duration,

      author,

      channelId,

      artists,

      rawBasicInfo: {
        id: basic.id || "",
        title: basic.title || "",
        author: basic.author || "",
        duration: basic.duration || 0,
        channelId: basic.channel_id || "",
        category: basic.category || ""
      }
    });

  } catch (error) {

    console.error(
      "YouTube Music test error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "YouTube Music 정보를 가져오지 못했습니다."
    });

  }
}
