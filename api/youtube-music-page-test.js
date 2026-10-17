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
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
          "Accept-Language":
            "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7"
        }
      });

    const html =
      await response.text();

    /*
      YouTube 페이지 안에서
      음악 관련 문자열이 실제로 존재하는지 확인
    */

    const keywords = [
      "Music in this video",
      "음악",
      "이 동영상의 음악",
      "song",
      "Song",
      "artist",
      "Artist",
      "album",
      "Album"
    ];

    const foundKeywords = [];

    for (const keyword of keywords) {
      if (html.includes(keyword)) {
        foundKeywords.push(keyword);
      }
    }

    /*
      음악 관련 문자열 주변의 HTML을 추출한다.
    */

    const snippets = [];

    for (const keyword of keywords) {

      let start = 0;

      while (true) {

        const index =
          html.indexOf(
            keyword,
            start
          );

        if (index === -1) {
          break;
        }

        const from =
          Math.max(
            0,
            index - 1000
          );

        const to =
          Math.min(
            html.length,
            index + 3000
          );

        snippets.push({
          keyword,
          snippet:
            html.slice(
              from,
              to
            )
        });

        start =
          index +
          keyword.length;

        /*
          너무 많은 데이터를 반환하지 않도록
          키워드당 최대 3개까지만
        */

        if (
          snippets.filter(
            item =>
              item.keyword ===
              keyword
          ).length >= 3
        ) {
          break;
        }
      }
    }

    /*
      YouTube가 페이지에 넣는
      초기 데이터의 주요 구조를 확인한다.
    */

    const initialDataMatch =
      html.match(
        /var ytInitialData = ({.*?});<\/script>/
      );

    const playerResponseMatch =
      html.match(
        /var ytInitialPlayerResponse = ({.*?});<\/script>/
      );

    return res.status(200).json({

      success: true,

      videoId,

      httpStatus:
        response.status,

      htmlLength:
        html.length,

      foundKeywords,

      hasInitialData:
        !!initialDataMatch,

      hasPlayerResponse:
        !!playerResponseMatch,

      snippets

    });

  } catch (error) {

    console.error(
      "YouTube music page test error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "YouTube 페이지를 가져오지 못했습니다."
    });
  }
}
