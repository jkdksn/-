export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "POST 또는 GET 요청만 허용됩니다."
    });
  }

  try {
    let title = "";
    let artist = "";

    if (req.method === "POST") {
      title = req.body?.title || "";
      artist = req.body?.artist || "";
    } else {
      title = req.query?.title || "";
      artist = req.query?.artist || "";
    }

    if (!title) {
      return res.status(400).json({
        success: false,
        error: "곡 제목이 없습니다."
      });
    }

    // --------------------------------
    // 문자열 정리
    // --------------------------------

    const normalize = (text) => {
      return String(text || "")
        .toLowerCase()
        .replace(/\([^)]*\)/g, " ")
        .replace(/\[[^\]]*\]/g, " ")
        .replace(/\{[^}]*\}/g, " ")
        .replace(/feat\.?/gi, " ")
        .replace(/ft\.?/gi, " ")
        .replace(/with/gi, " ")
        .replace(/&/g, " ")
        .replace(/[^a-z0-9가-힣\s]/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    };

    const targetTitle = normalize(title);
    const targetArtist = normalize(artist);

    console.log("================================");
    console.log("TARGET TITLE:", title);
    console.log("TARGET ARTIST:", artist);
    console.log("================================");

    // --------------------------------
    // Melon 통합검색
    // --------------------------------

    const searchUrl =
      "https://www.melon.com/search/total/index.htm?q=" +
      encodeURIComponent(title);

    const response = await fetch(searchUrl, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",

        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

        "Accept-Language":
          "ko-KR,ko;q=0.9,en-US;q=0.8",

        "Referer":
          "https://www.melon.com/"
      }
    });

    const html = await response.text();

    console.log(
      "Melon HTTP:",
      response.status
    );

    console.log(
      "Melon HTML length:",
      html.length
    );

    if (!response.ok) {
      return res.status(502).json({
        success: false,
        error: "Melon 검색 페이지에 접근하지 못했습니다.",
        status: response.status
      });
    }

    // --------------------------------
    // songId 추출
    // --------------------------------

    const idRegex =
      /(?:songId=|goSongDetail\(['"]|data-song-no=["'])(\d{5,})/g;

    const ids = [];
    const seenIds = new Set();

    let match;

    while ((match = idRegex.exec(html)) !== null) {
      const id = match[1];

      if (!seenIds.has(id)) {
        seenIds.add(id);
        ids.push(id);
      }
    }

    console.log(
      "Song IDs found:",
      ids.length
    );

    if (ids.length === 0) {
      return res.status(404).json({
        success: false,
        error:
          "Melon 검색 페이지에서 곡 SID를 찾지 못했습니다.",
        title,
        artist
      });
    }

    // --------------------------------
    // 각 곡 상세 페이지 확인
    // --------------------------------

    const candidates = [];

    // 너무 많은 요청을 하지 않도록 최대 20개
    const checkIds = ids.slice(0, 20);

    for (const songId of checkIds) {
      try {
        const detailUrl =
          "https://www.melon.com/song/detail.htm?songId=" +
          songId;

        const detailResponse = await fetch(
          detailUrl,
          {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",

              "Accept":
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

              "Accept-Language":
                "ko-KR,ko;q=0.9,en-US;q=0.8",

              "Referer":
                searchUrl
            }
          }
        );

        if (!detailResponse.ok) {
          continue;
        }

        const detailHtml =
          await detailResponse.text();

        // -----------------------------
        // 곡명 추출
        // -----------------------------

        let melonTitle = "";

        const titlePatterns = [
          /<div[^>]*class=["'][^"']*song_name[^"']*["'][^>]*>[\s\S]*?<strong[^>]*>([\s\S]*?)<\/strong>/i,

          /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i,

          /<title>([\s\S]*?)<\/title>/i
        ];

        for (const pattern of titlePatterns) {
          const found =
            detailHtml.match(pattern);

          if (found && found[1]) {
            melonTitle =
              found[1]
                .replace(/<[^>]+>/g, " ")
                .replace(/&amp;/g, "&")
                .replace(/&#39;/g, "'")
                .replace(/&quot;/g, '"')
                .replace(/\s+/g, " ")
                .trim();

            break;
          }
        }

        // 제목에 붙는 "- Melon" 제거
        melonTitle =
          melonTitle
            .replace(/\s*[-|]\s*Melon.*$/i, "")
            .trim();

        // -----------------------------
        // 아티스트 추출
        // -----------------------------

        let melonArtist = "";

        const artistPatterns = [
          /<div[^>]*class=["'][^"']*artist_name[^"']*["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i,

          /<span[^>]*class=["'][^"']*artist_name[^"']*["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i
        ];

        for (const pattern of artistPatterns) {
          const found =
            detailHtml.match(pattern);

          if (found && found[1]) {
            melonArtist =
              found[1]
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .trim();

            break;
          }
        }

        // -----------------------------
        // 제목 매칭
        // -----------------------------

        const normalizedMelonTitle =
          normalize(melonTitle);

        const normalizedMelonArtist =
          normalize(melonArtist);

        let titleMatch = false;
        let artistMatch = false;

        if (
          normalizedMelonTitle === targetTitle
        ) {
          titleMatch = true;
        }

        // 한쪽에 부가 설명이 붙은 경우
        if (
          !titleMatch &&
          targetTitle.length >= 3 &&
          (
            normalizedMelonTitle.includes(
              targetTitle
            ) ||
            targetTitle.includes(
              normalizedMelonTitle
            )
          )
        ) {
          titleMatch = true;
        }

        if (targetArtist && normalizedMelonArtist) {
          if (
            normalizedMelonArtist ===
            targetArtist
          ) {
            artistMatch = true;
          } else if (
            normalizedMelonArtist.includes(
              targetArtist
            ) ||
            targetArtist.includes(
              normalizedMelonArtist
            )
          ) {
            artistMatch = true;
          }
        }

        console.log(
          "CHECK:",
          songId,
          "|",
          melonTitle,
          "|",
          melonArtist,
          "| title:",
          titleMatch,
          "| artist:",
          artistMatch
        );

        if (titleMatch) {
          candidates.push({
            songId,
            title: melonTitle,
            artist: melonArtist,
            artistMatch
          });
        }

      } catch (error) {
        console.log(
          "Detail error:",
          songId,
          error.message
        );
      }
    }

    // --------------------------------
    // 정확한 후보 선택
    // --------------------------------

    if (candidates.length === 0) {
      return res.status(404).json({
        success: false,
        error:
          "Melon에서 제목이 일치하는 곡을 찾지 못했습니다.",
        title,
        artist,
        searchedIds: ids.length
      });
    }

    // 가수까지 일치하는 곡 우선
    const exactArtist =
      candidates.find(
        (item) => item.artistMatch
      );

    const selected =
      exactArtist || candidates[0];

    console.log("================================");
    console.log("SELECTED SONG");
    console.log("Title:", selected.title);
    console.log("Artist:", selected.artist);
    console.log("SID:", selected.songId);
    console.log("================================");

    return res.status(200).json({
      success: true,
      songId: String(selected.songId),
      title: selected.title,
      artist: selected.artist
    });

  } catch (error) {
    console.error(
      "Melon search error:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Melon 검색 중 오류가 발생했습니다.",
      detail: error.message
    });
  }
}
