export default async function handler(req, res) {
  try {
    const title =
      req.method === "POST"
        ? req.body?.title || ""
        : req.query?.title || "";

    const artist =
      req.method === "POST"
        ? req.body?.artist || ""
        : req.query?.artist || "";

    if (!title) {
      return res.status(400).json({
        success: false,
        error: "곡 제목이 없습니다."
      });
    }

    /*
      제목 비교용 정리
    */
    const normalize = (text) => {
      return String(text || "")
        .toLowerCase()
        .replace(/&amp;/g, "&")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&nbsp;/g, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\([^)]*\)/g, " ")
        .replace(/\[[^\]]*\]/g, " ")
        .replace(/[^a-z0-9가-힣]/gi, "")
        .trim();
    };

    const targetTitle = normalize(title);
    const targetArtist = normalize(artist);

    const searchUrl =
      "https://www.melon.com/search/total/index.htm?q=" +
      encodeURIComponent(title);

    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language":
          "ko-KR,ko;q=0.9,en-US;q=0.8",
        "Referer":
          "https://www.melon.com/"
      }
    });

    const html = await response.text();

    if (!response.ok) {
      return res.status(502).json({
        success: false,
        error: "Melon 검색에 실패했습니다.",
        status: response.status
      });
    }

    /*
      Melon 검색 결과의 SID 수집
    */

    const ids = [];

    const regex =
      /data-song-no=["'](\d{5,})["']/gi;

    let match;

    while ((match = regex.exec(html)) !== null) {
      if (!ids.includes(match[1])) {
        ids.push(match[1]);
      }
    }

    /*
      제목 / 아티스트 / 재생시간 추출
    */

    const candidates = [];

    for (const songId of ids) {

      const index =
        html.indexOf(`data-song-no="${songId}"`);

      if (index === -1) {
        continue;
      }

      const section =
        html.slice(
          Math.max(0, index - 6000),
          Math.min(html.length, index + 6000)
        );

      /*
        제목
      */

      const titleMatches = [
        ...section.matchAll(
          /class=["'][^"']*fc_gray[^"']*["'][^>]*title=["']([^"']+)["']/gi
        )
      ];

      for (const titleMatch of titleMatches) {

        const melonTitle =
          titleMatch[1]
            .replace(/&amp;/g, "&")
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&nbsp;/g, " ")
            .trim();

        const normalizedMelonTitle =
          normalize(melonTitle);

        /*
          제목은 우선 정확히 비교한다.
        */

        if (
          normalizedMelonTitle !== targetTitle
        ) {
          continue;
        }

        /*
          아티스트
        */

        let melonArtist = "";

        const artistMatch =
          section.match(
            /wrapArtistName[\s\S]{0,2500}?<a[^>]*>([\s\S]*?)<\/a>/i
          );

        if (artistMatch) {

          melonArtist =
            artistMatch[1]
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim();

        }

        const normalizedMelonArtist =
          normalize(melonArtist);

        /*
          아티스트가 전달된 경우
          아티스트도 확인한다.

          단, YouTube에서 아티스트를
          못 가져온 경우에는 제목만 확인한다.
        */

        if (
          targetArtist &&
          normalizedMelonArtist &&
          !(
            normalizedMelonArtist === targetArtist ||
            normalizedMelonArtist.includes(targetArtist) ||
            targetArtist.includes(normalizedMelonArtist)
          )
        ) {
          continue;
        }

        /*
          재생시간 찾기
        */

        let duration = "";

        const durationPatterns = [

          /playtime[^>]*>\s*([^<]+)</i,

          /duration[^>]*>\s*([^<]+)</i,

          /song_info[^>]*>[\s\S]{0,1000}?(\d{1,2}:\d{2})/i,

          /(\d{1,2}:\d{2})/

        ];

        for (
          const pattern of durationPatterns
        ) {

          const durationMatch =
            section.match(pattern);

          if (
            durationMatch &&
            durationMatch[1]
          ) {

            const value =
              durationMatch[1].trim();

            if (
              /^\d{1,2}:\d{2}$/.test(value)
            ) {

              duration = value;
              break;

            }

          }

        }

        candidates.push({
          songId: String(songId),
          title: melonTitle,
          artist: melonArtist,
          duration: duration
        });

        break;
      }

    }

    /*
      정확히 일치하는 결과가 없으면 실패.
      비슷한 곡을 대신 반환하지 않는다.
    */

    if (candidates.length === 0) {

      return res.status(404).json({
        success: false,
        error:
          "Melon에서 정확히 일치하는 곡을 찾지 못했습니다.",
        requestedTitle: title,
        requestedArtist: artist
      });

    }

    /*
      여러 개가 정확히 일치한다면
      아티스트가 일치하는 결과를 우선한다.
    */

    candidates.sort((a, b) => {

      const aArtist =
        targetArtist &&
        normalize(a.artist) === targetArtist
          ? 1
          : 0;

      const bArtist =
        targetArtist &&
        normalize(b.artist) === targetArtist
          ? 1
          : 0;

      return bArtist - aArtist;

    });

    const result =
      candidates[0];

    return res.status(200).json({
      success: true,
      songId: result.songId,
      title: result.title,
      artist: result.artist,
      duration: result.duration
    });

  } catch (error) {

    console.error(
      "Melon search error:",
      error
    );

    return res.status(500).json({
      success: false,
      error: error.message
    });

  }
}
