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

    const targets = [
      "videoDescriptionMusicSectionRenderer",
      "carouselLockups",
      "infoRowRenderer",
      "Music in this video",
      "음악"
    ];

    const results = {};

    for (const target of targets) {
      results[target] = {
        found:
          html.includes(target),
        count:
          countOccurrences(
            html,
            target
          ),
        snippets:
          findSnippets(
            html,
            target,
            3
          )
      };
    }

    /*
      음악 Renderer가 존재한다면
      그 주변에서 실제 JSON 형태를
      최대한 넓게 확인한다.
    */

    const rendererIndex =
      html.indexOf(
        "videoDescriptionMusicSectionRenderer"
      );

    let rendererContext = "";

    if (rendererIndex !== -1) {
      rendererContext =
        html.slice(
          Math.max(
            0,
            rendererIndex - 3000
          ),
          Math.min(
            html.length,
            rendererIndex + 15000
          )
        );
    }

    /*
      carouselLockups가 존재한다면
      주변 구조도 확인한다.
    */

    const carouselIndex =
      html.indexOf(
        "carouselLockups"
      );

    let carouselContext = "";

    if (carouselIndex !== -1) {
      carouselContext =
        html.slice(
          Math.max(
            0,
            carouselIndex - 3000
          ),
          Math.min(
            html.length,
            carouselIndex + 15000
          )
        );
    }

    return res.status(200).json({
      success: true,

      videoId,

      httpStatus:
        response.status,

      htmlLength:
        html.length,

      results,

      rendererContext,

      carouselContext
    });

  } catch (error) {

    console.error(
      "YouTube music renderer test error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "YouTube 페이지 분석에 실패했습니다."
    });
  }
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
        index - 1000
      );

    const end =
      Math.min(
        text.length,
        index +
          target.length +
          5000
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
