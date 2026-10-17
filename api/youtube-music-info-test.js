import { Innertube } from "youtubei.js";

export default async function handler(req, res) {
  try {
    const videoId =
      req.query?.videoId || "";

    if (!videoId) {
      return res.status(400).json({
        success: false,
        error: "videoId가 없습니다.",
        example:
          "/api/youtube-music-info-test?videoId=eb05R1XN6NA"
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

    /*
      전체 정보 중 우리가 찾는
      음악 관련 구조를 최대한 찾아본다.
    */

    const result = {
      videoId,

      basicInfo: {
        id:
          info?.basic_info?.id || "",

        title:
          info?.basic_info?.title || "",

        author:
          info?.basic_info?.author || "",

        channelId:
          info?.basic_info?.channel_id || "",

        duration:
          info?.basic_info?.duration || 0,

        category:
          info?.basic_info?.category || ""
      },

      /*
        getInfo() 최상위에서
        음악 관련 이름을 가진 속성들을 확인
      */
      topLevelKeys:
        safeKeys(info),

      musicRelated:
        findMusicRelated(info),

      /*
        watch page / player 정보에서
        music 관련 구조를 찾기 위한 디버그
      */
      pageData:
        inspectObject(info)

    };

    return res.status(200).json({
      success: true,
      result
    });

  } catch (error) {

    console.error(
      "YouTube Music info test error:",
      error
    );

    return res.status(500).json({
      success: false,

      error:
        error?.message ||
        "YouTube Music 정보를 가져오지 못했습니다.",

      stack:
        error?.stack || ""
    });
  }
}


/*
  객체의 key만 안전하게 가져온다.
*/
function safeKeys(value) {

  if (
    !value ||
    typeof value !== "object"
  ) {
    return [];
  }

  try {
    return Object.keys(value);
  } catch {
    return [];
  }
}


/*
  객체 내부에서
  music / song / artist / album
  관련 key를 찾아본다.
*/
function findMusicRelated(
  root
) {

  const found = [];

  const visited =
    new WeakSet();

  function walk(
    value,
    path,
    depth
  ) {

    if (
      !value ||
      typeof value !== "object"
    ) {
      return;
    }

    if (depth > 5) {
      return;
    }

    if (visited.has(value)) {
      return;
    }

    visited.add(value);

    let keys = [];

    try {
      keys =
        Object.keys(value);
    } catch {
      return;
    }

    for (const key of keys) {

      const lower =
        key.toLowerCase();

      const currentPath =
        path
          ? `${path}.${key}`
          : key;

      if (
        lower.includes("music") ||
        lower.includes("song") ||
        lower.includes("artist") ||
        lower.includes("album")
      ) {

        found.push({
          path:
            currentPath,

          type:
            value[key]
              ?.constructor
              ?.name || "",

          keys:
            safeKeys(
              value[key]
            ),

          text:
            extractText(
              value[key]
            )
        });
      }

      /*
        너무 큰 내부 객체 전체를
        무작정 순회하지 않도록 제한.
      */

      if (
        value[key] &&
        typeof value[key] ===
          "object"
      ) {
        walk(
          value[key],
          currentPath,
          depth + 1
        );
      }
    }
  }

  walk(
    root,
    "",
    0
  );

  return found.slice(
    0,
    100
  );
}


/*
  내부 구조 확인용.
  실제 데이터 자체를 전부 반환하지 않고
  구조만 확인한다.
*/
function inspectObject(
  root
) {

  const visited =
    new WeakSet();

  function inspect(
    value,
    depth
  ) {

    if (
      !value ||
      typeof value !== "object"
    ) {
      return value;
    }

    if (depth > 3) {
      return {
        type:
          value?.constructor
            ?.name || "",
        truncated: true
      };
    }

    if (visited.has(value)) {
      return {
        circular: true
      };
    }

    visited.add(value);

    const output = {
      type:
        value?.constructor
          ?.name || "",

      keys:
        safeKeys(value)
    };

    for (
      const key of
      safeKeys(value)
    ) {

      /*
        음악과 관련 있을 가능성이
        높은 속성만 상세히 본다.
      */

      const lower =
        key.toLowerCase();

      if (
        lower.includes("music") ||
        lower.includes("song") ||
        lower.includes("artist") ||
        lower.includes("album") ||
        lower.includes("track") ||
        lower.includes("playlist") ||
        lower.includes("microformat") ||
        lower.includes("contents")
      ) {

        output[key] =
          inspect(
            value[key],
            depth + 1
          );
      }
    }

    return output;
  }

  return inspect(
    root,
    0
  );
}


/*
  텍스트 추출
*/
function extractText(
  value
) {

  if (!value) {
    return "";
  }

  if (
    typeof value === "string"
  ) {
    return value;
  }

  if (
    typeof value.name ===
    "string"
  ) {
    return value.name;
  }

  if (
    typeof value.text ===
    "string"
  ) {
    return value.text;
  }

  if (
    typeof value.simpleText ===
    "string"
  ) {
    return value.simpleText;
  }

  if (
    Array.isArray(
      value.runs
    )
  ) {
    return value.runs
      .map(
        run =>
          typeof run === "string"
            ? run
            : run?.text || ""
      )
      .join("");
  }

  try {

    const text =
      value.toString();

    if (
      text &&
      text !==
        "[object Object]"
    ) {
      return text;
    }

  } catch {}

  return "";
}
