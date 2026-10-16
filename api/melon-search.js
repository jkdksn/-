export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "POST 요청만 허용됩니다."
    });
  }

  try {
    const { title, artist } = req.body || {};

    if (!title) {
      return res.status(400).json({
        success: false,
        error: "곡 제목이 없습니다."
      });
    }

    const clean = (text) => {
      return String(text || "")
        .toLowerCase()
        .replace(/\([^)]*\)/g, "")
        .replace(/\[[^\]]*\]/g, "")
        .replace(/[^\w가-힣\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    };

    const targetTitle = clean(title);
    const targetArtist = clean(artist);

    const query = `${title} ${artist || ""}`.trim();

    const callback = "melonCallback" + Date.now();

    const searchUrl =
      "https://www.melon.com/search/keyword/index.json" +
      "?jscallback=" +
      encodeURIComponent(callback) +
      "&query=" +
      encodeURIComponent(query) +
      "&_=" +
      Date.now();

    const response = await fetch(searchUrl, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",

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

    console.log("Melon status:", response.status);
    console.log("Melon response:", text.slice(0, 500));

    if (!response.ok) {
      throw new Error(
        `Melon 검색 실패: ${response.status}`
      );
    }

    let jsonText = text.trim();

    // JSONP 형식 처리
    const prefix = callback + "(";

    if (jsonText.startsWith(prefix)) {
      jsonText = jsonText.slice(prefix.length);

      if (jsonText.endsWith(");")) {
        jsonText = jsonText.slice(0, -2);
      } else if (jsonText.endsWith(")")) {
        jsonText = jsonText.slice(0, -1);
      }
    } else {
      // 혹시 JSONP 형식이 예상과 다를 경우
      const match = jsonText.match(
        /^[^(]+\(([\s\S]*)\);?$/
      );

      if (match && match[1]) {
        jsonText = match[1].replace(/\);?$/, "");
      }
    }

    let data;

    try {
      data = JSON.parse(jsonText);
    } catch (parseError) {
      console.error(
        "Melon JSON parse error:",
        parseError.message
      );

      return res.status(500).json({
        success: false,
        error: "멜론 검색 결과를 해석하지 못했습니다.",
        detail: parseError.message,
        preview: text.slice(0, 300)
      });
    }

    const songs =
      Array.isArray(data.SONGCONTENTS)
        ? data.SONGCONTENTS
        : [];

    console.log(
      "Melon songs found:",
      songs.length
    );

    if (songs.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Melon에서 검색 결과를 찾지 못했습니다.",
        query
      });
    }

    let bestSong = null;
    let bestScore = -1;

    for (const song of songs) {
      const melonTitle = clean(
        song.SONGNAME ||
        song.songName ||
        ""
      );

      const melonArtist = clean(
        song.ARTISTNAME ||
        song.artistName ||
        ""
      );

      let score = 0;

      // 제목
      if (melonTitle === targetTitle) {
        score += 100;
      } else if (
        melonTitle.includes(targetTitle) ||
        targetTitle.includes(melonTitle)
      ) {
        score += 50;
      }

      // 가수
      if (
        targetArtist &&
        melonArtist === targetArtist
      ) {
        score += 100;
      } else if (
        targetArtist &&
        (
          melonArtist.includes(targetArtist) ||
          targetArtist.includes(melonArtist)
        )
      ) {
        score += 50;
      }

      // 제목 + 가수 모두 정확히 일치
      if (
        melonTitle === targetTitle &&
        targetArtist &&
        melonArtist === targetArtist
      ) {
        score += 200;
      }

      console.log(
        "Candidate:",
        song.SONGNAME,
        song.ARTISTNAME,
        "score:",
        score
      );

      if (score > bestScore) {
        bestScore = score;
        bestSong = song;
      }
    }

    if (!bestSong || bestScore < 50) {
      return res.status(404).json({
        success: false,
        error: "Melon에서 일치하는 곡을 찾지 못했습니다.",
        query,
        bestScore
      });
    }

    const songId =
      bestSong.SONGID ||
      bestSong.songId ||
      bestSong.SONG_NO ||
      bestSong.songNo;

    if (!songId) {
      console.error(
        "Song found but ID missing:",
        bestSong
      );

      return res.status(404).json({
        success: false,
        error: "Melon 곡 ID를 찾지 못했습니다.",
        query
      });
    }

    return res.status(200).json({
      success: true,
      query,
      songId: String(songId),
      title:
        bestSong.SONGNAME ||
        bestSong.songName ||
        "",
      artist:
        bestSong.ARTISTNAME ||
        bestSong.artistName ||
        "",
      score: bestScore
    });

  } catch (error) {
    console.error(
      "Melon search error:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Melon 검색 중 오류가 발생했습니다.",
      detail: error.message
    });
  }
}
