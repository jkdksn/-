export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "GET 또는 POST만 허용됩니다."
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

    const searchUrl =
      "https://search.melon.com/search/resultList.htm?q=" +
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
          "https://search.melon.com/"
      }
    });

    const html = await response.text();

    /*
      Melon 검색 결과에서 songId 후보 추출
    */
    const patterns = [
      /songId=(\d{5,})/g,
      /goSongDetail\(['"](\d{5,})['"]\)/g,
      /data-song-no=["'](\d{5,})["']/g,
      /data-songid=["'](\d{5,})["']/gi
    ];

    const ids = [];
    const seen = new Set();

    for (const regex of patterns) {
      let match;

      while ((match = regex.exec(html)) !== null) {
        const id = match[1];

        if (!seen.has(id)) {
          seen.add(id);
          ids.push(id);
        }
      }
    }

    /*
      제목/가수 비교용 정규화
    */
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

    /*
      우선 검색 결과 HTML 자체에서
      제목 주변의 songId를 찾아본다.
    */
    const candidates = [];

    for (const id of ids.slice(0, 30)) {
      const idIndex = html.indexOf(id);

      if (idIndex === -1) continue;

      const around = html.substring(
        Math.max(0, idIndex - 1500),
        Math.min(html.length, idIndex + 1500)
      );

      const cleanAround = around
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, " ")
        .trim();

      const normalizedAround = normalize(cleanAround);

      const titleMatch =
        normalizedAround.includes(targetTitle);

      const artistMatch =
        targetArtist &&
        normalizedAround.includes(targetArtist);

      if (titleMatch) {
        candidates.push({
          songId: id,
          artistMatch: !!artistMatch
        });
      }
    }

    /*
      정확한 가수 일치 후보를 우선
    */
    const selected =
      candidates.find(x => x.artistMatch) ||
      candidates[0];

    if (selected) {
      return res.status(200).json({
        success: true,
        songId: selected.songId,
        title,
        artist,
        source: "search.melon.com"
      });
    }

    /*
      아직 못 찾았다면 진단 정보 반환
    */
    return res.status(404).json({
      success: false,
      error: "Melon 검색 결과에서 일치하는 곡을 찾지 못했습니다.",
      title,
      artist,
      melonStatus: response.status,
      finalUrl: response.url,
      htmlLength: html.length,
      foundSongIds: ids.length,
      songIds: ids.slice(0, 30),
      preview: html.substring(0, 1000)
    });

  } catch (error) {
    console.error("Melon search error:", error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
