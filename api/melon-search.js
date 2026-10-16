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

    const url =
      "https://www.melon.com/search/total/index.htm?q=" +
      encodeURIComponent(title);

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8",
        "Referer": "https://www.melon.com/"
      }
    });

    const html = await response.text();

    const ids = [];
    const regex = /data-song-no=["'](\d{5,})["']/gi;

    let match;

    while ((match = regex.exec(html)) !== null) {
      if (!ids.includes(match[1])) {
        ids.push(match[1]);
      }
    }

    return res.status(200).json({
      success: true,
      requestedTitle: title,
      requestedArtist: artist,
      melonStatus: response.status,
      htmlLength: html.length,
      songIds: ids.slice(0, 20)
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
}
