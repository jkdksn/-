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

    const decodeHtml = (text) => {
      return String(text || "")
        .replace(/&amp;/g, "&")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ");
    };

    const targetTitle = normalize(title);
    const targetArtist = normalize(artist);

    const searchUrl =
      "https://www.melon.com/search/total/index.htm?q=" +
      encodeURIComponent(title);

    const response = await fetch(searchUrl, {
      method: "GET",
      redirect: "follow",
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
      곡 검색 결과의 각 <tr>을 추출
    */
    const rows = [
      ...html.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)
    ];

    const candidates = [];

    for (const rowMatch of rows) {
      const row = rowMatch[0];

      /*
        SID
      */
      const sidMatch =
        row.match(/data-song-no=["'](\d{5,})["']/i) ||
        row.match(/value=["'](\d{5,})["']/i) ||
        row.match(/goSongDetail\(['"](\d{5,})['"]\)/i);

      if (!sidMatch) continue;

      const songId = sidMatch[1];

      /*
        곡 제목
        Melon 검색 결과의 fc_gray 링크를 우선 사용
      */
      const titleMatches = [
        ...row.matchAll(
          /class=["'][^"']*fc_gray[^"']*["'][^>]*title=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
        )
      ];

      let melonTitle = "";

      if (titleMatches.length > 0) {
        melonTitle =
          titleMatches[0][1] ||
          titleMatches[0][2];
      }

      /*
        위 방식이 안 맞으면 title 속성에서 찾기
      */
      if (!melonTitle) {
        const fallbackTitle =
          row.match(
            /title=["']([^"']+)["'][^>]*class=["'][^"']*fc_gray/i
          );

        if (fallbackTitle) {
          melonTitle = fallbackTitle[1];
        }
      }

      /*
        아티스트
      */
      const artistMatch =
        row.match(
          /class=["'][^"']*wrapArtistName[^"']*["'][\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i
        );

      let melonArtist =
        artistMatch ? artistMatch[1] : "";

      /*
        HTML 태그 제거 및 디코딩
      */
      melonTitle = decodeHtml(
        melonTitle
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      );

      melonArtist = decodeHtml(
        melonArtist
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      );

      if (!melonTitle) continue;

      const normalizedTitle =
        normalize(melonTitle);

      const normalizedArtist =
        normalize(melonArtist);

      /*
        제목 비교
      */
      let titleMatch = false;

      if (normalizedTitle === targetTitle) {
        titleMatch = true;
      }

      if (
        !titleMatch &&
        targetTitle.length >= 2 &&
        (
          normalizedTitle.includes(targetTitle) ||
          targetTitle.includes(normalizedTitle)
        )
      ) {
        titleMatch = true;
      }

      /*
        아티스트 비교
      */
      let artistMatchBool = false;

      if (targetArtist && normalizedArtist) {
        if (
          normalizedArtist === targetArtist
        ) {
          artistMatchBool = true;
        } else if (
          normalizedArtist.includes(targetArtist) ||
          targetArtist.includes(normalizedArtist)
        ) {
          artistMatchBool = true;
        }
      }

      if (titleMatch) {
        candidates.push({
          songId,
          title: melonTitle,
          artist: melonArtist,
          artistMatch: artistMatchBool
        });
      }
    }

    /*
      제목 + 가수가 모두 맞는 곡을 최우선 선택
    */
    const selected =
      candidates.find(
        item => item.artistMatch
      ) || candidates[0];

    if (!selected) {
      return res.status(404).json({
        success: false,
        error: "Melon에서 일치하는 곡을 찾지 못했습니다.",
        requestedTitle: title,
        requestedArtist: artist,
        searchedRows: rows.length,
        candidates
      });
    }

    return res.status(200).json({
      success: true,
      songId: String(selected.songId),
      title: selected.title,
      artist: selected.artist
    });

  } catch (error) {
    console.error("Melon search error:", error);

    return res.status(500).json({
      success: false,
      error: "Melon 검색 중 오류가 발생했습니다.",
      detail: error.message
    });
  }
}
