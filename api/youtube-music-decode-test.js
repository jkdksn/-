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
      YouTube HTML 내부에 들어있는
      \x22, \x7b 등의 인코딩을 복원한다.
    */

    const decoded =
      decodeYouTubeEscapes(html);

    const targets = [
      "videoDescriptionMusicSectionRenderer",
      "carouselLockups",
      "musicVideoType",
      "song",
      "artist",
      "album",
      "track",
      "videoId",
      "Music in this video",
      "음악"
    ];

    const results = {};

    for (const target of targets) {
      results[target] = {
        found:
          decoded.includes(target),

        count:
          countOccurrences(
            decoded,
            target
          ),

        snippets:
          findSnippets(
            decoded,
            target,
            3
          )
      };
    }

    /*
      음악 Renderer가 발견되면
      주변의 넓은 JSON을 반환한다.
    */

    const rendererContext =
      getContext(
        decoded,
        "videoDescriptionMusicSectionRenderer",
        20000
      );

    /*
      carouselLockups 주변도 확인한다.
    */

    const carouselContext =
      getContext(
        decoded,
        "carouselLockups",
        20000
      );

    /*
      "음악"이 실제 데이터에 등장하는
      부분도 확인한다.
    */

    const musicContext =
      getContext(
        decoded,
        "음악",
        10000
      );

    return res.status(200).json({
      success: true,

      videoId,

      httpStatus:
        response.status,

      htmlLength:
        html.length,

      decodedLength:
        decoded.length,

      results,

      rendererContext,

      carouselContext,

      musicContext
    });

  } catch (error) {

    console.error(
      "YouTube music decode test error:",
      error
    );

    return res.status(500).json({
      success: false,

      error:
        error?.message ||
        "YouTube 데이터 디코딩에 실패했습니다.",

      stack:
        error?.stack || ""
    });
  }
}


/* =========================
   YouTube \xNN 인코딩 복원
========================= */

function decodeYouTubeEscapes(
  text
) {

  let result =
    String(text || "");

  /*
    \x22 -> "
    \x7b -> {
    \x7d -> }
    \x5b -> [
    \x5d -> ]
    \x3a -> :
    \x2c -> ,
    \x5c -> \
  */

  result =
    result.replace(
      /\\x([0-9a-fA-F]{2})/g,
      (_, hex) => {
        return String.fromCharCode(
          parseInt(hex, 16)
        );
      }
    );

  /*
    혹시 \u0022 형태도 섞여 있으면
    같이 복원한다.
  */

  result =
    result.replace(
      /\\u([0-9a-fA-F]{4})/g,
      (_, hex) => {
        return String.fromCharCode(
          parseInt(hex, 16)
        );
      }
    );

  return result;
}


/* =========================
   문자열 등장 횟수
========================= */

function countOccurrences(
  text,
  target
) {

  let count = 0;
  let index = 0;

  while (true) {

    index =
      text.indexOf(
        target,
        index
      );

    if (index === -1) {
      break;
    }

    count++;

    index +=
      target.length;
  }

  return count;
}


/* =========================
   주변 문자열 추출
========================= */

function findSnippets(
  text,
  target,
  maxResults
) {

  const snippets = [];

  let index = 0;

  while (
    snippets.length <
    maxResults
  ) {

    index =
      text.indexOf(
        target,
        index
      );

    if (index === -1) {
      break;
    }

    const start =
      Math.max(
        0,
        index - 1500
      );

    const end =
      Math.min(
        text.length,
        index +
          target.length +
          7000
      );

    snippets.push(
      text.slice(
        start,
        end
      )
    );

    index +=
      target.length;
  }

  return snippets;
}


/* =========================
   특정 키워드 주변 추출
========================= */

function getContext(
  text,
  target,
  radius
) {

  const index =
    text.indexOf(target);

  if (index === -1) {
    return "";
  }

  const start =
    Math.max(
      0,
      index - radius
    );

  const end =
    Math.min(
      text.length,
      index +
        target.length +
        radius
    );

  return text.slice(
    start,
    end
  );
}
