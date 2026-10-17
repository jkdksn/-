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

    const next =
      page[1] || {};

    const panels =
      next?.engagement_panels || [];

    const structured =
      panels.find(
        panel =>
          panel?.content?.constructor?.name ===
          "StructuredDescriptionContent"
      );

    if (!structured) {
      return res.status(200).json({
        success: true,
        videoId,
        found: false,
        reason:
          "StructuredDescriptionContent를 찾지 못했습니다."
      });
    }

    const content =
      structured.content;

    const items =
      content?.items || [];

    const results =
      items.map(
        (item, index) => {

          let raw = {};

          try {
            raw = inspectObject(
              item
            );
          } catch {}

          return {
            index,

            constructor:
              item?.constructor?.name ||
              "",

            keys:
              Object.keys(
                item || {}
              ),

            ...raw
          };
        }
      );

    return res.status(200).json({
      success: true,

      videoId,

      found: true,

      itemCount:
        items.length,

      items:
        results
    });

  } catch (error) {

    console.error(
      "Structured description test error:",
      error
    );

    return res.status(500).json({
      success: false,

      error:
        error?.message ||
        "StructuredDescriptionContent 분석 실패",

      stack:
        error?.stack || ""
    });
  }
}


/* =========================
   내부 객체를 안전하게 분석
========================= */

function inspectObject(
  value
) {

  const result = {};

  if (
    value === null ||
    value === undefined
  ) {
    return result;
  }

  if (
    typeof value !== "object"
  ) {
    return {
      value:
        String(value).slice(
          0,
          1000
        )
    };
  }

  const keys =
    Object.keys(value);

  for (
    const key of keys
  ) {

    let child;

    try {
      child =
        value[key];
    } catch {
      continue;
    }

    const type =
      typeof child;

    if (
      type === "string" ||
      type === "number" ||
      type === "boolean"
    ) {

      result[key] =
        String(child).slice(
          0,
          1000
        );

      continue;
    }

    if (
      Array.isArray(child)
    ) {

      result[key] = {
        type: "array",
        length:
          child.length,

        items:
          child
            .slice(0, 20)
            .map(
              (item, index) => ({
                index,

                constructor:
                  item?.constructor
                    ?.name || "",

                keys:
                  item &&
                  typeof item ===
                    "object"
                    ? Object.keys(
                        item
                      )
                    : [],

                preview:
                  preview(item)
              })
            )
      };

      continue;
    }

    if (
      child &&
      typeof child ===
        "object"
    ) {

      result[key] = {
        type: "object",

        constructor:
          child?.constructor
            ?.name || "",

        keys:
          Object.keys(
            child
          ).slice(0, 50),

        preview:
          preview(child)
      };
    }
  }

  return result;
}


function preview(
  value
) {

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
    return String(value).slice(
      0,
      500
    );
  }

  if (
    Array.isArray(value)
  ) {
    return `[Array length=${value.length}]`;
  }

  if (
    typeof value === "object"
  ) {

    const keys =
      Object.keys(value);

    return {
      constructor:
        value?.constructor
          ?.name || "",

      keys:
        keys.slice(0, 30)
    };
  }

  return "";
}
