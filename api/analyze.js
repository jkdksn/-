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
          "곡 목록을 찾지 못했습니다. 영상 설명란에 곡 목록이 있는지 확인해주세요."
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

      if (
        url.pathname === "/playlist" &&
        playlistId
      ) {

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


async function youtubeAPI(endpoint) {

  const key =
    process.env.YOUTUBE_API_KEY;

  const separator =
    endpoint.includes("?")
      ? "&"
      : "?";

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/${endpoint}${separator}key=${key}`
  );

  const data =
    await response.json();

  if (!response.ok) {

    throw new Error(
      data?.error?.message ||
      "YouTube API 오류"
    );

  }

  return data;
}


async function getVideoTracks(videoId) {

  const data = await youtubeAPI(
    `videos?part=snippet&id=${encodeURIComponent(videoId)}`
  );

  if (!data.items || !data.items.length) {
    throw new Error(
      "YouTube 영상을 찾을 수 없습니다."
    );
  }

  const video =
    data.items[0];

  const snippet =
    video.snippet;

  const description =
    snippet.description || "";

  const tracks =
    parseTrackList(description);

  if (!tracks.length) {

    return [
      {
        title: cleanTitle(
          snippet.title
        ),
        artist:
          snippet.channelTitle || ""
      }
    ];

  }

  return tracks;
}


async function getPlaylistTracks(
  playlistId
) {

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

    if (
      song.title &&
      (
        song.artist ||
        text.includes("-") ||
        text.includes("–") ||
        text.includes("—") ||
        text.includes("|")
      )
    ) {

      tracks.push({
        ...song,
        timestamp: match[1]
      });

    }

  }

  return tracks;
}


function parseSongTitle(text) {

  text =
    text
      .replace(/^\d+\.\s*/, "")
      .replace(/^\[[^\]]+\]\s*/, "")
      .trim();

  let match =
    text.match(
      /^(.+?)\s+[-–—]\s+(.+)$/
    );

  if (match) {

    return {
      title: cleanTitle(match[1]),
      artist: cleanArtist(match[2])
    };

  }

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


function cleanTitle(text) {

  return text
    .replace(
      /\s*\((official|official audio|lyrics?|가사)[^)]*\)/gi,
      ""
    )
    .replace(
      /\s*\[[^\]]*(official|lyrics?|가사)[^\]]*\]/gi,
      ""
    )
    .trim();

}


function cleanArtist(text) {

  return text
    .replace(
      /\s*\((official|official audio|lyrics?|가사)[^)]*\)/gi,
      ""
    )
    .trim();

}
