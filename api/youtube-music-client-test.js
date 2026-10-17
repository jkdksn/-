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
        "WEB"
      );

    const page =
      info?.page || [];

    const page1 =
      page[1] || {};

    const panels =
      page1?.engagement_panels || [];

    const structured =
      panels.find(
        panel =>
          panel?.content?.constructor?.name ===
          "StructuredDescriptionContent"
      );

    if (!structured) {
      return res.status(200).json({
        success: true,

        testVersion:
          "STRUCTURED-20261017",

        videoId,

        found: false,

        panelCount:
          panels.length
      });
    }

    const content =
      structured.content;

    const items =
      content?.items || [];

    const output =
      items.map(
        (item, index) => ({
          index,

          constructor:
            item?.constructor?.name || "",

          keys:
            Object.keys(
              item || {}
            ),

          data:
            inspect(item)
        })
      );

    return res.status(200).json({
      success: true,

      testVersion:
        "STRUCTURED-20261017",

      videoId,

      found: true,

      itemCount:
        items.length,

      items:
        output
    });

  } catch (error) {

    console.error(
      "Structured description error:",
      error
    );

    return res.status(500).json({
      success: false,

      testVersion:
        "STRUCTURED-20261017",

      error:
        error?.message ||
        "분석 실패"
    });
  }
}


function inspect(value) {

  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {

    return {
      type: "array",

      length:
        value.length,

      items:
        value
          .slice(0, 20)
          .map(
            item =>
              inspect(item)
          )
    };
  }

  if (
    typeof value === "object"
  ) {

    const output = {};

    for (
      const key of
      Object.keys(value)
    ) {

      try {

        const child =
          value[key];

        if (
          typeof child === "string" ||
          typeof child === "number" ||
          typeof child === "boolean"
        ) {

          output[key] =
            String(child).slice(
              0,
              500
            );

        } else if (
          Array.isArray(child)
        ) {

          output[key] = {
            type: "array",

            length:
              child.length
          };

        } else if (
          child &&
          typeof child === "object"
        ) {

          output[key] = {
            type:
              child?.constructor?.name ||
              "Object",

            keys:
              Object.keys(
                child
              ).slice(
                0,
                30
              )
          };
        }

      } catch {}
    }

    return output;
  }

  return null;
}
