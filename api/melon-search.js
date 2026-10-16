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

    const query = `${title} ${artist || ""}`.trim();

    const searchUrl =
      "https://www.melon.com/search/total/index.htm?q=" +
      encodeURIComponent(query);

    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"
      }
    });

    if (!response.ok) {
      throw new Error(`Melon 검색 실패: ${response.status}`);
    }

    const html = await response.text();

    // Melon 곡 상세 페이지의 songId 찾기
    const patterns = [
      /songId=(\d+)/g,
      /songNo=(\d+)/g,
      /goSongDetail\(['"]?(\d+)/g
    ];

    const ids = [];

    for (const pattern of patterns) {
      let match;

      while ((match = pattern.exec(html)) !== null) {
        if (!ids.includes(match[1])) {
          ids.push(match[1]);
        }
      }
    }

    if (ids.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Melon에서 곡을 찾지 못했습니다.",
        query
      });
    }

    return res.status(200).json({
      success: true,
      query,
      songId: ids[0]
    });

  } catch (error) {
    console.error("Melon search error:", error);

    return res.status(500).json({
      success: false,
      error: "Melon 검색 중 오류가 발생했습니다."
    });
  }
}
