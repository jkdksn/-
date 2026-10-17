import { Innertube } from "youtubei.js";

export default async function handler(req, res) {
  try {
    const videoId = req.query?.videoId || "";

    if (!videoId) {
      return res.status(400).json({
        success: false,
        error: "videoId가 없습니다."
      });
    }

    const youtube = await Innertube.create({
      lang: "ko",
      location: "KR"
    });

    const info = await youtube.getInfo(
      videoId,
      "WEB"
    );

    const page = info?.page || [];
    const page1 = page[1] || {};

    const panels =
      page1?.engagement_panels || [];

    const result = [];

    for (let i = 0; i < panels.length; i++) {
      const panel = panels[i];
      const content = panel?.content;

      result.push({
        index: i,

        constructor:
          content?.constructor?.name || "",

        keys:
          content &&
          typeof content === "object"
            ? Object.keys(content)
            : [],

        items:
          Array.isArray(content?.items)
            ? content.items.map((item, index) => ({
                index,

                constructor:
                  item?.constructor?.name || "",

                keys:
                  item &&
                  typeof item === "object"
                    ? Object.keys(item)
                    : [],

                preview:
                  getPreview(item)
              }))
            : []
      });
    }

    return res.status(200).json({
      success: true,

      videoId,

      panelCount:
        panels.length,

      panels:
        result
    });

  } catch (error) {
    console.error(
      "Structured test error:",
      error
    );

    return res.status(500).json({
      success: false,

      error:
        error?.message ||
        "분석 실패"
    });
  }
}


function getPreview(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value).slice(0, 500);
  }

  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length
    };
  }

  if (typeof value === "object") {
    const output = {};

    for (
      const key of Object.keys(value).slice(0, 30)
    ) {
      try {
        const child = value[key];

        if (
          typeof child === "string" ||
          typeof child === "number" ||
          typeof child === "boolean"
        ) {
          output[key] =
            String(child).slice(0, 500);
        } else if (
          Array.isArray(child)
        ) {
          output[key] =
            `[Array ${child.length}]`;
        } else if (
          child &&
          typeof child === "object"
        ) {
          output[key] =
            `[${child.constructor?.name || "Object"}]`;
        }
      } catch {}
    }

    return output;
  }

  return "";
}
