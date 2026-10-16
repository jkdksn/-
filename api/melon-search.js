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

    // 문자열 정리
    const clean = (text) => {
      return String(text || "")
        .toLowerCase()
        .replace(/\([^)]*\)/g, " ")
        .replace(/\[[^\]]*\]/g, " ")
        .replace(/\{[^}]*\}/g, " ")
        .replace(/feat\.?/gi, " ")
        .replace(/ft\.?/gi, " ")
        .replace(/with/gi, " ")
        .replace(/[^\w가-힣\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    };

    const normalizeTitle = (text) => {
      return clean(text)
        .replace(/\bblack heart\b/gi, "검정색 하트")
        .replace(/\bthe\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    };

    const targetTitle = normalizeTitle(title);
    const targetArtist = clean(artist);

    console.log("YouTube title:", title);
    console.log("YouTube artist:", artist);
    console.log("Normalized title:", targetTitle);
    console.log("Normalized artist:", targetArtist);

    // --------------------------------
    // 1차: 제목 + 가수
    // --------------------------------

    const queries = [];

    if (title && artist) {
      queries.push(`${title} ${artist}`);
    }

    // --------------------------------
    // 2차: 제목만
    // --------------------------------

    queries.push(title);

    let allSongs = [];

    for (const query of queries) {
      const callback =
        "melonCallback" +
        Date.now() +
        Math.floor(Math.random() * 1000);

      const searchUrl =
        "https://www.melon.com/search/keyword/index.json" +
        "?jscallback=" +
        encodeURIComponent(callback) +
        "&query=" +
        encodeURIComponent(query) +
        "&_=" +
        Date.now();

      console.log("Melon query:", query);

      const response = await fetch(searchUrl, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",

          "Accept":
            "application/javascript, application/json, text/javascript, */*; q=0.01",

          "Accept-Language":
            "ko-KR,ko;q=0.9,en-US;q=0.8",

          "Referer":
            "https://www.melon.com/index.htm",

          "X-Requested-With":
            "XMLHttpRequest"
        }
      });

      const text = await response.text();

      console.log(
        "Melon status:",
        response.status
      );

      console.log(
        "Melon response preview:",
        text.substring(0, 200)
      );

      if (!response.ok) {
        console.error(
          "Melon request failed:",
          response.status
        );
        continue;
      }

      let jsonText = text.trim();

      // JSONP 제거
      const start = jsonText.indexOf("(");
      const end = jsonText.lastIndexOf(")");

      if (start !== -1 && end !== -1) {
        jsonText =
          jsonText.substring(start + 1, end);
      }

      try {
        const data = JSON.parse(jsonText);

        const songs =
          Array.isArray(data.SONGCONTENTS)
            ? data.SONGCONTENTS
            : [];

        console.log(
          "Songs returned:",
          songs.length
        );

        allSongs.push(...songs);

        if (songs.length > 0) {
          break;
        }
      } catch (parseError) {
        console.error(
          "JSON parse failed:",
          parseError.message
        );
      }
    }

    // 중복 제거
    const uniqueSongs = [];

    const seen = new Set();

    for (const song of allSongs) {
      const id =
        song.SONGID ||
        song.songId ||
        song.SONG_NO ||
        song.songNo;

      if (!id) continue;

      if (seen.has(String(id))) {
        continue;
      }

      seen.add(String(id));
      uniqueSongs.push(song);
    }

    console.log(
      "Unique Melon songs:",
      uniqueSongs.length
    );

    if (uniqueSongs.length === 0) {
      return res.status(404).json({
        success: false,
        error:
          "Melon 검색 결과를 가져오지 못했습니다.",
        query: title
      });
    }

    // --------------------------------
    // 가장 적합한 곡 찾기
    // --------------------------------

    let bestSong = null;
    let bestScore = -1;

    for (const song of uniqueSongs) {
      const melonTitle =
        normalizeTitle(
          song.SONGNAME ||
          song.songName ||
          ""
        );

      const melonArtist =
        clean(
          song.ARTISTNAME ||
          song.artistName ||
          ""
        );

      let score = 0;

      // 제목 완전 일치
      if (melonTitle === targetTitle) {
        score += 1000;
      }

      // 제목 포함
      else if (
        melonTitle.includes(targetTitle) ||
        targetTitle.includes(melonTitle)
      ) {
        score += 500;
      }

      // 제목 단어 비교
      const targetWords =
        targetTitle.split(" ").filter(Boolean);

      const melonWords =
        melonTitle.split(" ").filter(Boolean);

      let sameWords = 0;

      for (const word of targetWords) {
        if (melonWords.includes(word)) {
          sameWords++;
        }
      }

      score += sameWords * 100;

      // 가수 일치
      if (
        targetArtist &&
        melonArtist === targetArtist
      ) {
        score += 300;
      }

      // 가수 포함
      else if (
        targetArtist &&
        (
          melonArtist.includes(targetArtist) ||
          targetArtist.includes(melonArtist)
        )
      ) {
        score += 150;
      }

      console.log(
        "Candidate:",
        song.SONGNAME,
        "|",
        song.ARTISTNAME,
        "|",
        "score:",
        score
      );

      if (score > bestScore) {
        bestScore = score;
        bestSong = song;
      }
    }

    if (!bestSong) {
      return res.status(404).json({
        success: false,
        error:
          "Melon에서 적절한 곡을 찾지 못했습니다."
      });
    }

    const songId =
      bestSong.SONGID ||
      bestSong.songId ||
      bestSong.SONG_NO ||
      bestSong.songNo;

    if (!songId) {
      return res.status(404).json({
        success: false,
        error:
          "Melon 곡 ID(SID)를 찾지 못했습니다."
      });
    }

    console.log(
      "FINAL SONG:",
      bestSong.SONGNAME,
      bestSong.ARTISTNAME,
      songId
    );

    return res.status(200).json({
      success: true,
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
      error:
        "Melon 검색 중 오류가 발생했습니다.",
      detail: error.message
    });
  }
}
