export default async function handler(req, res) {
  try {
    const title = req.query?.title || "검정색 하트";

    const urls = [
      `https://www.melon.com/search/total/index.htm?q=${encodeURIComponent(title)}`,
      `https://search.melon.com/search/total/index.htm?q=${encodeURIComponent(title)}`,
      `https://search.melon.com/search/mcom_index.htm?q=${encodeURIComponent(title)}`
    ];

    const results = [];

    for (const url of urls) {
      try {
        const response = await fetch(url, {
          method: "GET",
          redirect: "follow",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Accept":
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language":
              "ko-KR,ko;q=0.9,en-US;q=0.8",
            "Referer":
              "https://www.melon.com/"
          }
        });

        const html = await response.text();

        const ids = [
          ...new Set([
            ...[...html.matchAll(/songId=(\d{5,})/g)].map(m => m[1]),
            ...[...html.matchAll(/goSongDetail\(['"](\d{5,})['"]\)/g)].map(m => m[1]),
            ...[...html.matchAll(/data-song-no=["'](\d{5,})["']/g)].map(m => m[1]),
            ...[...html.matchAll(/data-songid=["'](\d{5,})["']/gi)].map(m => m[1])
          ])
        ];

        results.push({
          url,
          status: response.status,
          finalUrl: response.url,
          length: html.length,
          foundSongIds: ids.length,
          songIds: ids.slice(0, 20),
          hasTargetTitle: html.includes(title),
          hasSongDetail: html.includes("songDetail"),
          preview: html.substring(0, 300)
        });

      } catch (error) {
        results.push({
          url,
          error: error.message
        });
      }
    }

    return res.status(200).json({
      success: true,
      title,
      results
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
