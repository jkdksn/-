export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "GET 또는 POST 요청만 허용됩니다."
    });
  }

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

    // 비교용 정규화
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
        .replace(/\{[^}]*\}/g, " ")
        .replace(/feat\.?/gi, " ")
        .replace(/ft\.?/gi, " ")
        .replace(/with/gi, " ")
        .replace(/[^a-z0-9가-힣]/gi, "")
        .trim();
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
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
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
      Melon 검색 결과에서
      data-song-no="34588190"
      같은 SID를 직접 찾는다.
    */

    const songIds = [
      ...html.matchAll(/data-song-no=["'](\d{5,})["']/gi)
    ].map((m) => m[1]);

    const uniqueSongIds = [...new Set(songIds)];

    /*
      각 SID 주변의 HTML을 잘라서
      제목 / 아티스트를 확인한다.
    */

    const candidates = [];

    for (const songId of uniqueSongIds) {
      const index = html.indexOf(`data-song-no="${songId}"`);

      if (index === -1) continue;

      const start = Math.max(0, index - 5000);
      const end = Math.min(html.length, index + 5000);

      const section = html.slice(start, end);

      // 제목
      let melonTitle = "";

      const titlePatterns = [
        /class=["'][^"']*fc_gray[^"']*["'][^>]*title=["']([^"']+)["']/i,
        /title=["']([^"']+)["'][^>]*class=["'][^"']*fc_gray/i,
        /goSongDetail\(['"]\d+['"]\)[\s\S]{0,1500}?title=["']([^"']+)["']/i
      ];

      for (const pattern of titlePatterns) {
        const match = section.match(pattern);

        if (match && match[1]) {
          melonTitle = match[1];
          break;
        }
      }

      // HTML 태그 제거
      melonTitle = melonTitle
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (!melonTitle) continue;

      // 아티스트
      let melonArtist = "";

      const artistMatch = section.match(
        /class=["'][^"']*wrapArtistName[^"']*["'][\s\S]{0,1500}?<a[^>]*>([\s\S]*?)<\/a>/i
      );

      if (artistMatch) {
        melonArtist = artistMatch[1]
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }

      melonArtist = melonArtist
        .replace(/&amp;/g, "&")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&nbsp;/g, " ");

      const normalizedTitle = normalize(melonTitle);
      const normalizedArtist = normalize(melonArtist);

      /*
        제목 비교
        예:
        검정색 하트
        검정색하트 (Feat. ...)
        → 둘 다 검정색하트
      */

      const titleMatch =
        normalizedTitle === targetTitle ||
        normalizedTitle.includes(targetTitle) ||
        targetTitle.includes(normalizedTitle);

      if (!titleMatch) continue;

      /*
        아티스트는 한글/영문 표기가 다를 수 있으므로
        제목이 확실히 일치하면 우선 후보로 인정한다.
      */

      let artistMatch = false;

      if (targetArtist && normalizedArtist) {
        artistMatch =
          normalizedArtist === targetArtist ||
          normalizedArtist.includes(targetArtist) ||
          targetArtist.includes(normalizedArtist);
      }

      candidates.push({
        songId,
        title: melonTitle,
        artist: melonArtist,
        artistMatch
      });
    }

    if (candidates.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Melon에서 일치하는 곡을 찾지 못했습니다.",
        requestedTitle: title,
        requestedArtist: artist,
        foundSongIds: uniqueSongIds.slice(0, 20)
      });
    }

    // 아티스트까지 맞으면 최우선
    const selected =
      candidates.find((item) => item.artistMatch) ||
      candidates[0];

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
