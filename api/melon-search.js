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

    const callback =
      "melonCallback" + Date.now();

    const searchUrl =
      "https://www.melon.com/search/keyword/index.json" +
      "?jscallback=" +
      encodeURIComponent(callback) +
      "&query=" +
      encodeURIComponent(query);

    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Referer":
          "https://www.melon.com/"
      }
    });

    if (!response.ok) {
      throw new Error(
        `Melon 검색 실패: ${response.status}`
      );
    }

    const text = await response.text();

    /*
      Melon 응답은 JSONP 형태일 수 있다.

      melonCallback123(...);
    */

    let jsonText = text.trim();

    const prefix = callback + "(";

    if (jsonText.startsWith(prefix)) {
      jsonText = jsonText.slice(prefix.length);

      if (jsonText.endsWith(");")) {
        jsonText = jsonText.slice(0, -2);
      } else if (jsonText.endsWith(")")) {
        jsonText = jsonText.slice(0, -1);
      }
    }

    const data = JSON.parse(jsonText);

    const songs =
      Array.isArray(data.SONGCONTENTS)
        ? data.SONGCONTENTS
        : [];

    if (songs.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Melon에서 곡을 찾지 못했습니다.",
        query
      });
    }

    /*
      검색 결과를 제목 + 아티스트 기준으로 평가한다.
    */

    let bestSong = null;
    let bestScore = -1;

    for (const song of songs) {

      const melonTitle =
        clean(song.SONGNAME);

      const melonArtist =
        clean(song.ARTISTNAME);

      let score = 0;

      /*
        제목이 정확히 같으면 높은 점수
      */

      if (melonTitle === targetTitle) {
        score += 100;
      } else if (
        melonTitle.includes(targetTitle) ||
        targetTitle.includes(melonTitle)
      ) {
        score += 50;
      }

      /*
        아티스트가 정확히 같으면 높은 점수
      */

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

      /*
        둘 다 어느 정도 일치하면 추가 점수
      */

      if (
        melonTitle === targetTitle &&
        targetArtist &&
        melonArtist === targetArtist
      ) {
        score += 200;
      }

      if (score > bestScore) {
        bestScore = score;
        bestSong = song;
      }
    }

    /*
      제목과 아티스트가 전혀 맞지 않는 검색 결과라면
      잘못된 곡을 넘기지 않는다.
    */

    if (!bestSong || bestScore < 50) {
      return res.status(404).json({
        success: false,
        error: "Melon에서 일치하는 곡을 찾지 못했습니다.",
        query
      });
    }

    const songId =
      bestSong.SONGID ||
      bestSong.songId;

    if (!songId) {
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
      title: bestSong.SONGNAME || "",
      artist: bestSong.ARTISTNAME || "",
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
