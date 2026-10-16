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

    // -----------------------------
    // 문자열 정리
    // -----------------------------

    const normalize = (text) => {
      return String(text || "")
        .toLowerCase()
        .replace(/\([^)]*\)/g, " ")
        .replace(/\[[^\]]*\]/g, " ")
        .replace(/\{[^}]*\}/g, " ")
        .replace(/feat\.?/gi, " ")
        .replace(/ft\.?/gi, " ")
        .replace(/with/gi, " ")
        .replace(/&/g, " ")
        .replace(/[^\w가-힣\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    };

    const titleKey = normalize(title);
    const artistKey = normalize(artist);

    console.log("================================");
    console.log("YouTube title:", title);
    console.log("YouTube artist:", artist);
    console.log("Title key:", titleKey);
    console.log("Artist key:", artistKey);
    console.log("================================");

    // -----------------------------
    // 검색어 여러 개 사용
    // -----------------------------

    const queries = [];

    if (title && artist) {
      queries.push(`${title} ${artist}`);
    }

    queries.push(title);

    let songs = [];

    for (const query of queries) {
      try {
        const callback =
          "melonCallback" +
          Date.now() +
          Math.floor(Math.random() * 10000);

        const url =
          "https://www.melon.com/search/keyword/index.json" +
          "?jscallback=" +
          encodeURIComponent(callback) +
          "&query=" +
          encodeURIComponent(query) +
          "&_=" +
          Date.now();

        console.log("Searching Melon:", query);

        const response = await fetch(url, {
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
          "Melon HTTP:",
          response.status
        );

        if (!response.ok) {
          console.log(
            "Melon request rejected:",
            response.status
          );
          continue;
        }

        let jsonText = text.trim();

        // JSONP 제거
        const firstParen = jsonText.indexOf("(");
        const lastParen = jsonText.lastIndexOf(")");

        if (
          firstParen !== -1 &&
          lastParen > firstParen
        ) {
          jsonText =
            jsonText.substring(
              firstParen + 1,
              lastParen
            );
        }

        const data = JSON.parse(jsonText);

        const result =
          Array.isArray(data.SONGCONTENTS)
            ? data.SONGCONTENTS
            : [];

        console.log(
          "Results:",
          result.length
        );

        songs.push(...result);

        // 결과가 충분히 있으면 추가 검색 불필요
        if (result.length > 0) {
          break;
        }

      } catch (error) {
        console.log(
          "Melon query error:",
          error.message
        );
      }
    }

    // -----------------------------
    // SID 없는 결과 제거 + 중복 제거
    // -----------------------------

    const unique = [];
    const seen = new Set();

    for (const song of songs) {
      const sid =
        song.SONGID ||
        song.songId ||
        song.SONG_NO ||
        song.songNo;

      if (!sid) continue;

      const key = String(sid);

      if (seen.has(key)) continue;

      seen.add(key);
      unique.push(song);
    }

    console.log(
      "Unique candidates:",
      unique.length
    );

    if (unique.length === 0) {
      return res.status(404).json({
        success: false,
        error:
          "Melon에서 검색 결과를 가져오지 못했습니다.",
        title,
        artist
      });
    }

    // -----------------------------
    // 정확한 후보 찾기
    // -----------------------------

    const candidates = [];

    for (const song of unique) {
      const melonTitle = normalize(
        song.SONGNAME ||
        song.songName ||
        ""
      );

      const melonArtist = normalize(
        song.ARTISTNAME ||
        song.artistName ||
        ""
      );

      let titleMatch = false;
      let artistMatch = false;

      // 제목 정확히 일치
      if (melonTitle === titleKey) {
        titleMatch = true;
      }

      // 한쪽이 다른 쪽을 포함하는 경우
      if (
        !titleMatch &&
        melonTitle &&
        (
          melonTitle.includes(titleKey) ||
          titleKey.includes(melonTitle)
        )
      ) {
        // 너무 짧은 제목은 오인 방지를 위해 제외
        if (titleKey.length >= 3) {
          titleMatch = true;
        }
      }

      // 가수 확인
      if (artistKey) {
        if (melonArtist === artistKey) {
          artistMatch = true;
        }

        if (
          !artistMatch &&
          melonArtist.includes(artistKey)
        ) {
          artistMatch = true;
        }

        if (
          !artistMatch &&
          artistKey.includes(melonArtist)
        ) {
          artistMatch = true;
        }
      }

      console.log(
        "Candidate:",
        song.SONGNAME,
        "|",
        song.ARTISTNAME,
        "| title:",
        titleMatch,
        "| artist:",
        artistMatch
      );

      // 제목이 맞는 것만 후보로 넣는다.
      if (titleMatch) {
        candidates.push({
          song,
          titleMatch,
          artistMatch
        });
      }
    }

    // -----------------------------
    // 제목 일치 후보가 없는 경우
    // -----------------------------

    if (candidates.length === 0) {
      return res.status(404).json({
        success: false,
        error:
          "Melon에서 제목이 일치하는 곡을 찾지 못했습니다.",
        title,
        artist
      });
    }

    // -----------------------------
    // 가수까지 맞는 후보 우선
    // -----------------------------

    let selected = null;

    const artistMatched =
      candidates.filter(
        (item) => item.artistMatch
      );

    if (artistMatched.length > 0) {
      selected = artistMatched[0];
    } else {
      // 제목이 정확히 일치하고 가수 정보가 없거나
      // Melon 표기가 다른 경우 제목 후보 사용
      selected = candidates[0];
    }

    const song = selected.song;

    const songId =
      song.SONGID ||
      song.songId ||
      song.SONG_NO ||
      song.songNo;

    if (!songId) {
      return res.status(404).json({
        success: false,
        error:
          "Melon 곡 SID를 찾지 못했습니다."
      });
    }

    console.log("================================");
    console.log("SELECTED");
    console.log("Title:", song.SONGNAME);
    console.log("Artist:", song.ARTISTNAME);
    console.log("SID:", songId);
    console.log("================================");

    return res.status(200).json({
      success: true,
      songId: String(songId),
      title:
        song.SONGNAME ||
        song.songName ||
        "",
      artist:
        song.ARTISTNAME ||
        song.artistName ||
        ""
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
