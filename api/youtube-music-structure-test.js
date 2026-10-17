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

    const url =
      "https://www.youtube.com/watch?v=" +
      encodeURIComponent(videoId);

    const response =
      await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",

          "Accept-Language":
            "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7"
        }
      });

    const html =
      await response.text();

    /*
      YouTube 페이지 안의
      ytInitialPlayerResponse를 추출
    */

    const playerResponse =
      extractJsonVariable(
        html,
        "ytInitialPlayerResponse"
      );

    if (!playerResponse) {
      return res.status(200).json({
        success: true,
        videoId,
        found: false,
        error:
          "ytInitialPlayerResponse를 찾지 못했습니다.",
        htmlLength:
          html.length
      });
    }

    /*
      실제 음악 섹션 탐색
    */

    const matches =
      [];

    walk(
      playerResponse,
      "",
      matches
    );

    /*
      우리가 찾는
      videoDescriptionMusicSectionRenderer
    */

    const musicSections =
      matches.filter(
        item =>
          item.key ===
          "videoDescriptionMusicSectionRenderer"
      );

    /*
      carouselLockups 추출
    */

    const tracks =
      [];

    for (
      const section of
      musicSections
    ) {

      const renderer =
        section.value;

      const carouselLockups =
        renderer?.carouselLockups;

      if (
        !Array.isArray(
          carouselLockups
        )
      ) {
        continue;
      }

      for (
        const lockup of
        carouselLockups
      ) {

        const parsed =
          parseMusicLockup(
            lockup
          );

        if (
          parsed.song ||
          parsed.artist ||
          parsed.album
        ) {
          tracks.push(
            parsed
          );
        }
      }
    }

    /*
      혹시 다른 위치에
      videoDescriptionMusicSectionRenderer가
      들어있는 경우까지 대비
    */

    return res.status(200).json({

      success: true,

      videoId,

      found:
        musicSections.length >
        0,

      musicSectionCount:
        musicSections.length,

      trackCount:
        tracks.length,

      tracks,

      /*
        실제 구조 확인용
      */

      structure:
        musicSections.map(
          item => ({
            path:
              item.path,

            keys:
              Object.keys(
                item.value ||
                {}
              ),

            carouselCount:
              Array.isArray(
                item.value
                  ?.carouselLockups
              )
                ? item.value
                    .carouselLockups
                    .length
                : 0
          })
        )

    });

  } catch (error) {

    console.error(
      "YouTube music structure test error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "음악 구조를 분석하지 못했습니다."
    });
  }
}


/* =========================
   JSON 변수 추출
========================= */

function extractJsonVariable(
  html,
  variableName
) {

  const marker =
    "var " +
    variableName +
    " = ";

  const start =
    html.indexOf(
      marker
    );

  if (start === -1) {
    return null;
  }

  const jsonStart =
    start +
    marker.length;

  /*
    JSON 객체의 정확한 끝을
    괄호 깊이로 찾는다.
  */

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (
    let i = jsonStart;
    i < html.length;
    i++
  ) {

    const char =
      html[i];

    if (inString) {

      if (escaped) {
        escaped = false;
        continue;
      }

      if (
        char === "\\"
      ) {
        escaped = true;
        continue;
      }

      if (
        char === '"'
      ) {
        inString = false;
      }

      continue;
    }

    if (
      char === '"'
    ) {
      inString = true;
      continue;
    }

    if (
      char === "{"
    ) {
      depth++;
    }

    if (
      char === "}"
    ) {

      depth--;

      if (depth === 0) {

        const jsonText =
          html.slice(
            jsonStart,
            i + 1
          );

        try {
          return JSON.parse(
            jsonText
          );
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}


/* =========================
   JSON 전체 탐색
========================= */

function walk(
  value,
  path,
  matches,
  depth = 0
) {

  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return;
  }

  if (depth > 30) {
    return;
  }

  if (
    Array.isArray(value)
  ) {

    for (
      let i = 0;
      i < value.length;
      i++
    ) {

      walk(
        value[i],
        path +
          "[" +
          i +
          "]",
        matches,
        depth + 1
      );
    }

    return;
  }

  for (
    const [
      key,
      child
    ] of Object.entries(
      value
    )
  ) {

    const currentPath =
      path
        ? path +
          "." +
          key
        : key;

    if (
      key ===
      "videoDescriptionMusicSectionRenderer"
    ) {

      matches.push({
        key,
        path:
          currentPath,
        value:
          child
      });
    }

    if (
      child &&
      typeof child ===
        "object"
    ) {

      walk(
        child,
        currentPath,
        matches,
        depth + 1
      );
    }
  }
}


/* =========================
   음악 Lockup 분석
========================= */

function parseMusicLockup(
  lockup
) {

  const result = {
    song: "",
    artist: "",
    album: "",
    license: ""
  };

  const renderer =
    lockup
      ?.carouselLockupRenderer;

  if (!renderer) {
    return result;
  }

  /*
    infoRows 안에
    SONG / ARTIST / ALBUM / LICENSES가
    들어있는 구조를 우선 사용
  */

  const rows =
    renderer.infoRows;

  if (
    Array.isArray(rows)
  ) {

    for (
      const row of rows
    ) {

      const info =
        row?.infoRowRenderer;

      if (!info) {
        continue;
      }

      const title =
        getText(
          info.title
        )
        .trim()
        .toUpperCase();

      const value =
        getText(
          info.defaultMetadata
        ).trim();

      const expanded =
        getText(
          info.expandedMetadata
        ).trim();

      if (
        title === "SONG"
      ) {
        result.song =
          value;
      }

      else if (
        title === "ARTIST"
      ) {
        result.artist =
          value;
      }

      else if (
        title === "ALBUM"
      ) {
        result.album =
          value;
      }

      else if (
        title === "LICENSES"
      ) {
        result.license =
          expanded ||
          value;
      }
    }
  }

  /*
    SONG 정보가 infoRows에 없으면
    videoLockup 쪽에서도 확인
  */

  if (
    !result.song
  ) {

    const videoLockup =
      renderer.videoLockup;

    const compact =
      videoLockup
        ?.compactVideoRenderer;

    if (compact) {
      result.song =
        getText(
          compact.title
        );
    }
  }

  return result;
}


/* =========================
   텍스트 추출
========================= */

function getText(
  value
) {

  if (!value) {
    return "";
  }

  if (
    typeof value ===
    "string"
  ) {
    return value;
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
          run?.text || ""
      )
      .join("");
  }

  return "";
}
