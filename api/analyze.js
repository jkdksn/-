export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST 요청만 허용됩니다."
    });
  }

  try {
    const { url } = req.body || {};

    if (!url) {
      return res.status(400).json({
        error: "YouTube 링크가 없습니다."
      });
    }

    const parsed = parseYouTubeURL(url);

    if (!parsed) {
      return res.status(400).json({
        error: "올바른 YouTube 링크가 아닙니다."
      });
    }

    const apiKey =
      process.env.YOUTUBE_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "YOUTUBE_API_KEY가 설정되지 않았습니다."
      });
    }

    let tracks = [];

    if (parsed.type === "video") {
      tracks =
        await getVideoTracks(
          parsed.id,
          apiKey
        );
    } else {
      tracks =
        await getPlaylistTracks(
          parsed.id,
          apiKey
        );
    }

    return res.status(200).json({
      success: true,
      tracks
    });

  } catch (error) {
    console.error(
      "Analyze error:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "YouTube 정보를 가져오는 중 오류가 발생했습니다."
    });
  }
}


/* =========================
   YouTube URL 파싱
========================= */

function parseYouTubeURL(value) {
  try {
    const url = new URL(value);

    if (
      url.hostname === "youtu.be"
    ) {
      const id =
        url.pathname
          .replace(/^\/+/, "")
          .split("/")[0];

      if (!id) {
        return null;
      }

      return {
        type: "video",
        id
      };
    }

    if (
      url.hostname.includes(
        "youtube.com"
      ) ||
      url.hostname.includes(
        "youtube-nocookie.com"
      )
    ) {
      const videoId =
        url.searchParams.get("v");

      const playlistId =
        url.searchParams.get("list");

      if (videoId) {
        return {
          type: "video",
          id: videoId
        };
      }

      if (playlistId) {
        return {
          type: "playlist",
          id: playlistId
        };
      }
    }

    return null;

  } catch {
    return null;
  }
}


/* =========================
   단일 영상
========================= */

async function getVideoTracks(
  videoId,
  apiKey
) {
  const url =
    "https://www.googleapis.com/youtube/v3/videos" +
    "?part=snippet" +
    "&id=" +
    encodeURIComponent(videoId) +
    "&key=" +
    encodeURIComponent(apiKey);

  const response =
    await fetch(url);

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      "YouTube API 요청에 실패했습니다."
    );
  }

  if (
    !data.items ||
    !data.items.length
  ) {
    return [];
  }

  const snippet =
    data.items[0].snippet || {};

  const title =
    snippet.title || "";

  const description =
    snippet.description || "";

  const tracks =
    parseDescription(
      description
    );

  /*
    설명에서 곡 목록을 찾지 못하면
    영상 제목 자체를 하나의 곡으로 사용
  */

  if (!tracks.length) {
    const parsedTitle =
      parseTitle(title);

    return [
      {
        title:
          parsedTitle.title,

        artist:
          parsedTitle.artist,

        timestamp:
          null,

        youtubeVideoId:
          videoId
      }
    ];
  }

  return tracks.map(
    (track) => ({
      ...track,
      youtubeVideoId:
        videoId
    })
  );
}


/* =========================
   플레이리스트
========================= */

async function getPlaylistTracks(
  playlistId,
  apiKey
) {
  const tracks = [];

  let nextPageToken = "";

  do {
    let url =
      "https://www.googleapis.com/youtube/v3/playlistItems" +
      "?part=snippet" +
      "&playlistId=" +
      encodeURIComponent(
        playlistId
      ) +
      "&maxResults=50" +
      "&key=" +
      encodeURIComponent(
        apiKey
      );

    if (nextPageToken) {
      url +=
        "&pageToken=" +
        encodeURIComponent(
          nextPageToken
        );
    }

    const response =
      await fetch(url);

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data?.error?.message ||
        "YouTube playlist API 요청에 실패했습니다."
      );
    }

    for (
      const item of
      data.items || []
    ) {
      const snippet =
        item.snippet || {};

      const videoId =
        snippet.resourceId?.videoId ||
        "";

      const title =
        snippet.title || "";

      if (!videoId) {
        continue;
      }

      const parsedTitle =
        parseTitle(title);

      tracks.push({
        title:
          parsedTitle.title,

        artist:
          parsedTitle.artist,

        timestamp:
          null,

        youtubeVideoId:
          videoId
      });
    }

    nextPageToken =
      data.nextPageToken || "";

  } while (nextPageToken);

  return tracks;
}


/* =========================
   설명에서 곡 목록 추출
========================= */

function parseDescription(
  description
) {
  const tracks = [];

  const lines =
    String(
      description || ""
    ).split(/\r?\n/);

  for (
    const line of lines
  ) {
    const text =
      line.trim();

    if (!text) {
      continue;
    }

    /*
      00:00 제목
      01:23 아티스트 - 제목
      같은 형태 처리
    */

    const match =
      text.match(
        /^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/
      );

    if (!match) {
      continue;
    }

    const timestamp =
      match[1];

    const content =
      match[2].trim();

    const parsed =
      parseTitle(content);

    if (!parsed.title) {
      continue;
    }

    tracks.push({
      title:
        parsed.title,

      artist:
        parsed.artist,

      timestamp
    });
  }

  return tracks;
}


/* =========================
   제목 / 가수 분리
========================= */

function parseTitle(
  text
) {
  let value =
    String(
      text || ""
    )
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  if (!value) {
    return {
      title: "",
      artist: ""
    };
  }

  /*
    "아티스트 - 제목"
  */

  const dashMatch =
    value.match(
      /^(.+?)\s+-\s+(.+)$/
    );

  if (dashMatch) {
    return {
      artist:
        cleanText(
          dashMatch[1]
        ),

      title:
        cleanText(
          dashMatch[2]
        )
    };
  }

  /*
    "제목 - 아티스트" 형태는
    우선 제목으로 처리
  */

  return {
    title:
      cleanText(value),

    artist: ""
  };
}


/* =========================
   문자열 정리
========================= */

function cleanText(
  text
) {
  return String(
    text || ""
  )
    .replace(
      /<[^>]+>/g,
      " "
    )
    .replace(
      /&amp;/g,
      "&"
    )
    .replace(
      /&#39;/g,
      "'"
    )
    .replace(
      /&quot;/g,
      '"'
    )
    .replace(
      /&nbsp;/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}
