export default async function handler(req, res) {
  try {
    const videoId = req.query?.videoId || "";

    if (!videoId) {
      return res.status(400).json({
        success: false,
        error: "videoId가 없습니다."
      });
    }

    const response = await fetch(
      "https://www.youtube.com/watch?v=" +
      encodeURIComponent(videoId),
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1",
          "Accept-Language":
            "ko-KR,ko;q=0.9,en-US;q=0.8"
        }
      }
    );

    const html = await response.text();

    const decoded = decodeYouTubeEscapes(html);

    const targets = [
      "videoDescriptionMusicSectionRenderer",
      "carouselLockups",
      "musicVideoType",
      "song",
      "artist",
      "album",
      "track",
      "videoId",
      "Music in this video",
      "음악"
    ];

    const results = {};

    for (const target of targets) {
      results[target] = {
        found: decoded.includes(target),
        count: countOccurrences(decoded, target)
      };
    }

    return res.status(200).json({
      success: true,
      videoId,
      httpStatus: response.status,
      htmlLength: html.length,
      decodedLength: decoded.length,
      results
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "오류가 발생했습니다."
    });
  }
}


function decodeYouTubeEscapes(text) {
  let result = String(text || "");

  result = result.replace(
    /\\x([0-9a-fA-F]{2})/g,
    (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
  );

  result = result.replace(
    /\\u([0-9a-fA-F]{4})/g,
    (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
  );

  return result;
}


function countOccurrences(text, target) {
  let count = 0;
  let index = 0;

  while (true) {
    index = text.indexOf(target, index);

    if (index === -1) {
      break;
    }

    count++;
    index += target.length;
  }

  return count;
}
