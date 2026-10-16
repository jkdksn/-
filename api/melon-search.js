export default async function handler(req, res) {
  const title = req.query?.title || "검정색 하트";

  try {
    const url =
      "https://www.melon.com/search/total/index.htm?q=" +
      encodeURIComponent(title);

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9",
        "Referer": "https://www.melon.com/"
      }
    });

    const html = await response.text();

    const ids = [
      ...new Set(
        [...html.matchAll(/(?:songId=|goSongDetail\(['"]|data-song-no=["'])(\d{5,})/g)]
          .map(m => m[1])
      )
    ];

    return res.status(200).json({
      success: true,
      title,
      melonStatus: response.status,
      htmlLength: html.length,
      foundSongIds: ids.length,
      songIds: ids.slice(0, 30),
      preview: html.substring(0, 500)
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
