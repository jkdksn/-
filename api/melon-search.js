export default async function handler(req, res) {
  const title =
    req.query?.title || "검정색 하트";

  const artist =
    req.query?.artist || "토일";

  const callback =
    "melonCallback" + Date.now();

  const url =
    "https://www.melon.com/search/keyword/index.json" +
    "?jscallback=" +
    encodeURIComponent(callback) +
    "&query=" +
    encodeURIComponent(`${title} ${artist}`) +
    "&_=" +
    Date.now();

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",

        "Accept":
          "*/*",

        "Accept-Language":
          "ko-KR,ko;q=0.9,en-US;q=0.8",

        "Referer":
          "https://www.melon.com/index.htm",

        "X-Requested-With":
          "XMLHttpRequest"
      }
    });

    const text = await response.text();

    return res.status(200).json({
      test: true,
      requestedTitle: title,
      requestedArtist: artist,
      melonStatus: response.status,
      responseLength: text.length,
      responseStart: text.substring(0, 1000)
    });

  } catch (error) {
    return res.status(500).json({
      test: false,
      error: error.message
    });
  }
}
