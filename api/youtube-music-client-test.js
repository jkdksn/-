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

    const clients = [
      "WEB",
      "YTMUSIC",
      "ANDROID"
    ];

    const results = [];

    for (const client of clients) {

      try {

        const info =
          await youtube.getInfo(
            videoId,
            client
          );

        let tracks = [];

        try {
          tracks =
            info.music_tracks || [];
        } catch {}

        const page =
          info?.page || [];

        const next =
          page[1] || {};

        const engagementPanels =
          next?.engagement_panels || [];

        results.push({
          client,

          musicTrackCount:
            Array.isArray(tracks)
              ? tracks.length
              : 0,

          musicTracks:
            Array.isArray(tracks)
              ? tracks.slice(0, 30)
              : [],

          pageCount:
            page.length,

          page1Keys:
            Object.keys(next),

          engagementPanelCount:
            Array.isArray(
              engagementPanels
            )
              ? engagementPanels.length
              : 0,

          engagementPanelTypes:
            Array.isArray(
              engagementPanels
            )
              ? engagementPanels.map(
                  panel => ({
                    type:
                      panel?.content
                        ?.constructor
                        ?.name || "",

                    contentType:
                      panel?.content
                        ?.type || "",

                    keys:
                      panel?.content &&
                      typeof panel.content ===
                        "object"
                        ? Object.keys(
                            panel.content
                          ).slice(0, 30)
                        : []
                  })
                ).slice(0, 30)
              : []
        });

      } catch (error) {

        results.push({
          client,

          error:
            error?.message || ""
        });
      }
    }

    return res.status(200).json({
      success: true,

      videoId,

      results
    });

  } catch (error) {

    console.error(
      "YouTube client comparison error:",
      error
    );

    return res.status(500).json({
      success: false,

      error:
        error?.message ||
        "YouTube 클라이언트 비교 중 오류가 발생했습니다."
    });
  }
}
