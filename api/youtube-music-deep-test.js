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

    const found = [];

    const targets = [
      "music",
      "song",
      "artist",
      "album",
      "track",
      "musictrack",
      "musicTrack",
      "videoDescription",
      "musicSection"
    ];

    walk(
      info,
      "",
      targets,
      found
    );

    return res.status(200).json({
      success: true,

      videoId,

      infoKeys:
        Object.keys(info || {}),

      foundCount:
        found.length,

      found:
        found.slice(0, 100)
    });

  } catch (error) {

    console.error(
      "YouTube Music deep test error:",
      error
    );

    return res.status(500).json({
      success: false,

      error:
        error?.message ||
        "YouTube Music 정보를 분석하지 못했습니다."
    });
  }
}


/* =========================
   객체 전체 재귀 탐색
========================= */

function walk(
  value,
  path,
  targets,
  found,
  depth = 0
) {

  if (
    found.length >= 100 ||
    depth > 15 ||
    value === null ||
    value === undefined
  ) {
    return;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {

    const lowerPath =
      path.toLowerCase();

    const matched =
      targets.some(target =>
        lowerPath.includes(
          target.toLowerCase()
        )
      );

    if (matched) {

      found.push({
        path,

        type:
          typeof value,

        value:
          String(value).slice(
            0,
            500
          )
      });
    }

    return;
  }

  if (Array.isArray(value)) {

    for (
      let i = 0;
      i < value.length;
      i++
    ) {

      walk(
        value[i],
        path + "[" + i + "]",
        targets,
        found,
        depth + 1
      );

      if (found.length >= 100) {
        return;
      }
    }

    return;
  }

  if (
    typeof value === "object"
  ) {

    let keys = [];

    try {
      keys =
        Object.keys(value);
    } catch {
      return;
    }

    for (
      const key of keys
    ) {

      const nextPath =
        path
          ? path + "." + key
          : key;

      /*
        키 이름 자체에 음악 관련
        단어가 있으면 먼저 기록
      */

      const keyMatched =
        targets.some(target =>
          key
            .toLowerCase()
            .includes(
              target.toLowerCase()
            )
        );

      if (
        keyMatched &&
        found.length < 100
      ) {

        let preview = "";

        try {
          const child =
            value[key];

          if (
            typeof child === "string" ||
            typeof child === "number" ||
            typeof child === "boolean"
          ) {
            preview =
              String(child).slice(
                0,
                500
              );
          } else if (
            child &&
            typeof child === "object"
          ) {
            preview =
              Array.isArray(child)
                ? `[Array length=${child.length}]`
                : `{Object keys=${Object.keys(child).slice(0, 20).join(",")}}`;
          }
        } catch {}

        found.push({
          path: nextPath,
          type: typeof value[key],
          value: preview
        });
      }

      walk(
        value[key],
        nextPath,
        targets,
        found,
        depth + 1
      );

      if (found.length >= 100) {
        return;
      }
    }
  }
}
