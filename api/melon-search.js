export default async function handler(req, res) {
  try {
    const title = req.query?.title || "검정색 하트";

    const url =
      "https://www.melon.com/search/total/index.htm?q=" +
      encodeURIComponent(title);

    const response = await fetch(url, {
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

    const matches = [
      ...html.matchAll(
        /(?:songId=|goSongDetail\(['"]|data-song-no=["'])(\d{5,})/g
      )
    ];

    const ids = [
      ...new Set(matches.map(m => m[1]))
    ];

    const candidates = [];

    for (const id of ids.slice(0, 10)) {
      const index = html.indexOf(id);

      const around = html.substring(
        Math.max(0, index - 2500),
        Math.min(html.length, index + 2500)
      );

      candidates.push({
        songId: id,
        around: around
          .replace(/\r/g, "")
          .replace(/\t/g, " ")
          .replace(/\n/g, " ")
          .replace(/\s+/g, " ")
          .substring(0, 5000)
      });
    }

    return res.status(200).json({
      success: true,
      title,
      status: response.status,
      htmlLength: html.length,
      foundSongIds: ids.length,
      candidates
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
