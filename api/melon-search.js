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
        "Referer": "https://www.melon.com/"
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

    const ids = [];
    const regex = /data-song-no=["'](\d{5,})["']/gi;

    let match;

    while ((match = regex.exec(html)) !== null) {
      if (!ids.includes(match[1])) {
        ids.push(match[1]);
      }
    }

    // SID 주변 HTML에서 제목을 찾는다.
    for (const songId of ids) {
      const index = html.indexOf(`data-song-no="${songId}"`);

      if (index === -1) continue;

      const section = html.slice(
        Math.max(0, index - 5000),
        Math.min(html.length, index + 5000)
      );

      // 제목 후보들을 모두 찾는다.
      const titleMatches = [
        ...section.matchAll(
          /class=["'][^"']*fc_gray[^"']*["'][^>]*title=["']([^"']+)["']/gi
        )
      ];

      for (const titleMatch of titleMatches) {
        const melonTitle = titleMatch[1]
          .replace(/&amp;/g, "&")
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/&nbsp;/g, " ")
          .trim();

        const normalizedMelonTitle = normalize(melonTitle);

        if (
          normalizedMelonTitle === targetTitle ||
          normalizedMelonTitle.includes(targetTitle) ||
          targetTitle.includes(normalizedMelonTitle)
        ) {
          // 아티스트도 주변에서 찾아본다.
          let melonArtist = "";

          const artistMatch = section.match(
            /wrapArtistName[\s\S]{0,2000}?<a[^>]*>([\s\S]*?)<\/a>/i
          );

          if (artistMatch) {
            melonArtist = artistMatch[1]
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim();
          }

          return res.status(200).json({
            success: true,
            songId: String(songId),
            title: melonTitle,
            artist: melonArtist
          });
        }
      }
    }

    return res.status(404).json({
      success: false,
      error: "Melon에서 일치하는 곡을 찾지 못했습니다.",
      requestedTitle: title,
      requestedArtist: artist,
      foundSongIds: ids.slice(0, 20)
    });

  } catch (error) {
    console.error("Melon search error:", error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
