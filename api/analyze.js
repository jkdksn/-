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

    if (!process.env.YOUTUBE_API_KEY) {
      return res.status(500).json({
        error: "YouTube API 키가 설정되지 않았습니다."
      });
    }

    let tracks = [];

    if (parsed.type === "playlist") {
      tracks = await getPlaylistTracks(parsed.id);
    } else {
      tracks = await getVideoTracks(parsed.id);
    }

    if (!tracks.length) {
      return res.status(404).json({
        error:
          "곡 목록을 찾지 못했습니다. 영상의 제목이나 설명에서 음악 정보를 찾을 수 없습니다."
      });
    }

    return res.status(200).json({
      success: true,
      tracks
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error:
        error.message ||
        "YouTube 정보를 가져오는 중 오류가 발생했습니다."
    });
  }
}


/* =========================
   YouTube URL 분석
========================= */

function parseYouTubeURL(value) {
  try {
    const url = new URL(value);

    if (url.hostname === "youtu.be") {
      return {
        type: "video",
        id: url.pathname.substring(1)
      };
    }

    if (
      url.hostname.includes("youtube.com") ||
      url.hostname.includes("youtube-nocookie.com")
    ) {
      const videoId = url.searchParams.get("v");
      const playlistId = url.searchParams.get("list");

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
   YouTube API
========================= */

async function youtubeAPI(endpoint) {
  const key = process.env.YOUTUBE_API_KEY;

  const separator =
    endpoint.includes("?") ? "&" : "?";

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/${endpoint}${separator}key=${key}`
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      "YouTube API 오류"
    );
  }

  return data;
}


/* =========================
   단일 영상
========================= */

async function getVideoTracks(videoId) {

  const data = await youtubeAPI(
    `videos?part=snippet&id=${encodeURIComponent(videoId)}`
  );

  if (!data.items || !data.items.length) {
    throw new Error(
      "YouTube 영상을 찾을 수 없습니다."
    );
  }

  const video = data.items[0];
  const snippet = video.snippet;

  const title = snippet.title || "";
  const description = snippet.description || "";
  const channel = snippet.channelTitle || "";
  const tags = snippet.tags || [];

  /*
   * 1순위:
   * 설명란의 타임스탬프 트랙리스트
   */

  const timestampTracks =
    parseTrackList(description);

  if (timestampTracks.length) {
    return timestampTracks;
  }


  /*
   * 2순위:
   * 설명에 직접 적혀 있는
   * Artist / Song / Track / Music 정보
   */

  const musicInfo =
    parseMusicInfo(description);

  if (musicInfo.length) {
    return musicInfo;
  }


  /*
   * 3순위:
   * 제목 자체에서
   * "아티스트 - 곡명" 형태 찾기
   */

  const titleParsed =
    parseSongTitle(title);

  if (titleParsed.artist) {
    return [titleParsed];
  }


  /*
   * 4순위:
   * 태그에서 음악 정보를 추정
   *
   * 제목과 관련된 태그가 있는 경우 활용
   */

  const tagResult =
    parseTagsForMusic(
      tags,
      title
    );

  if (tagResult) {
    return [tagResult];
  }


  /*
   * 5순위:
   * 마지막 수단
   *
   * 이전처럼 채널명을 무조건
   * 아티스트로 사용하지 않는다.
   */

  return [
    {
      title: cleanTitle(title),
      artist: ""
    }
  ];
}


/* =========================
   플레이리스트
========================= */

async function getPlaylistTracks(playlistId) {

  const tracks = [];

  let pageToken = "";

  while (true) {

    let endpoint =
      `playlistItems?part=snippet&maxResults=50&playlistId=${encodeURIComponent(playlistId)}`;

    if (pageToken) {
      endpoint +=
        `&pageToken=${encodeURIComponent(pageToken)}`;
    }

    const data =
      await youtubeAPI(endpoint);

    for (const item of data.items || []) {

      const title =
        item.snippet?.title || "";

      if (
        !title ||
        title === "Deleted video" ||
        title === "Private video"
      ) {
        continue;
      }

      const parsed =
        parseSongTitle(title);

      tracks.push(parsed);
    }

    if (!data.nextPageToken) {
      break;
    }

    pageToken =
      data.nextPageToken;
  }

  return tracks;
}


/* =========================
   설명란 타임스탬프
========================= */

function parseTrackList(description) {

  const lines =
    description.split(/\r?\n/);

  const tracks = [];

  for (const line of lines) {

    const match =
      line.match(
        /^\s*(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+?)\s*$/
      );

    if (!match) {
      continue;
    }

    const text =
      match[2]
        .replace(/https?:\/\/\S+/g, "")
        .trim();

    const song =
      parseSongTitle(text);

    if (song.title) {

      tracks.push({
        ...song,
        timestamp: match[1]
      });
    }
  }

  return tracks;
}


/* =========================
   설명의 음악 정보
========================= */

function parseMusicInfo(description) {

  const tracks = [];

  const lines =
    description.split(/\r?\n/);

  let artist = "";
  let song = "";

  for (const line of lines) {

    const clean =
      line
        .replace(/\*\*/g, "")
        .replace(/https?:\/\/\S+/g, "")
        .trim();

    if (!clean) continue;

    /*
     * Artist: xxx
     * Artist - xxx
     */

    const artistMatch =
      clean.match(
        /^(?:artist|아티스트|가수)\s*[:：-]\s*(.+)$/i
      );

    if (artistMatch) {
      artist =
        cleanArtist(
          artistMatch[1]
        );
    }

    /*
     * Song: xxx
     * Track: xxx
     * Title: xxx
     */

    const songMatch =
      clean.match(
        /^(?:song|track|title|곡명|노래)\s*[:：-]\s*(.+)$/i
      );

    if (songMatch) {
      song =
        cleanTitle(
          songMatch[1]
        );
    }
  }

  if (song) {
    tracks.push({
      title: song,
      artist
    });
  }

  return tracks;
}


/* =========================
   제목 파싱
========================= */

function parseSongTitle(text) {

  text =
    text
      .replace(/^\d+\.\s*/, "")
      .replace(/^\[[^\]]+\]\s*/, "")
      .trim();

  /*
   * Artist - Title
   *
   * 단, 하이픈이 여러 개 들어간 경우
   * 첫 번째 하이픈을 기준으로만 나누지 않는다.
   */

  let match =
    text.match(
      /^(.+?)\s+[-–—]\s+(.+)$/
    );

  if (match) {

    return {
      artist: cleanArtist(match[1]),
      title: cleanTitle(match[2])
    };
  }


  /*
   * Title | Artist
   */

  if (text.includes("|")) {

    const parts =
      text.split("|");

    return {
      title:
        cleanTitle(parts[0]),
      artist:
        cleanArtist(
          parts.slice(1).join("|")
        )
    };
  }


  return {
    title: cleanTitle(text),
    artist: ""
  };
}


/* =========================
   태그 분석
========================= */

function parseTagsForMusic(tags, title) {

  if (!Array.isArray(tags) || !tags.length) {
    return null;
  }

  const lowerTitle =
    title.toLowerCase();

  /*
   * 제목과 동일하거나
   * 제목의 일부를 포함하는 태그만 후보로 사용
   */

  const related =
    tags.filter(tag => {

      const value =
        String(tag || "")
          .trim();

      if (!value) return false;

      const lower =
        value.toLowerCase();

      return (
        lower === lowerTitle ||
        lowerTitle.includes(lower) ||
        lower.includes(lowerTitle)
      );
    });

  if (!related.length) {
    return null;
  }

  return {
    title: cleanTitle(title),
    artist: ""
  };
}


/* =========================
   문자열 정리
========================= */

function cleanTitle(text) {

  return String(text || "")
    .replace(
      /\s*\((official|official audio|lyrics?|가사|mv|music video)[^)]*\)/gi,
      ""
    )
    .replace(
      /\s*\[[^\]]*(official|lyrics?|가사|mv|music video)[^\]]*\]/gi,
      ""
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


function cleanArtist(text) {

  return String(text || "")
    .replace(
      /\s*\((official|official audio|lyrics?|가사|mv|music video)[^)]*\)/gi,
      ""
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}
