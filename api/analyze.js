import { Innertube } from "youtubei.js";

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

    const youtube = await Innertube.create({
      lang: "ko",
      location: "KR"
    });

    let tracks = [];

    if (parsed.type === "playlist") {

      tracks =
        await getMusicPlaylist(
          youtube,
          parsed.id
        );

    } else {

      tracks =
        await getMusicVideo(
          youtube,
          parsed.id
        );

    }

    if (!tracks.length) {

      return res.status(404).json({
        error:
          "YouTube Music에서 곡 정보를 찾지 못했습니다."
      });

    }

    return res.status(200).json({
      success: true,
      source: "YouTube Music",
      tracks
    });

  } catch (error) {

    console.error(
      "YouTube Music analyze error:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "YouTube Music 정보를 가져오는 중 오류가 발생했습니다."
    });

  }

}


/* =========================================================
   URL
========================================================= */

function parseYouTubeURL(value) {

  try {

    const url = new URL(value);

    if (url.hostname === "youtu.be") {

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
      url.hostname.includes("youtube.com") ||
      url.hostname.includes("youtube-nocookie.com")
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


/* =========================================================
   YouTube Music 단일 곡
========================================================= */

async function getMusicVideo(
  youtube,
  videoId
) {

  /*
    YouTube Music 전용 getInfo
  */

  const info =
    await youtube.music.getInfo(
      videoId
    );


  const basic =
    info?.basic_info || {};


  /*
    제목
  */

  let title =
    basic.title || "";


  /*
    아티스트 후보
  */

  let artist = "";


  /*
    YouTube Music 정보에서
    아티스트를 찾는다.
  */

  try {

    const page =
      info?.page;

    const pageText =
      JSON.stringify(page || {});


    const artistMatches =
      pageText.match(
        /"text":"([^"]+)"/g
      ) || [];


    for (
      const item of artistMatches
    ) {

      const value =
        item
          .replace(/^"text":"/, "")
          .replace(/"$/, "");


      if (
        value &&
        value !== title &&
        value.length < 100
      ) {

        artist = value;

        break;

      }

    }

  } catch {

    artist = "";

  }


  /*
    기본 author도 확인
  */

  if (!artist) {

    artist =
      basic.author || "";

  }


  /*
    재생시간
  */

  const duration =
    Number(
      basic.duration || 0
    );


  /*
    제목이나 아티스트가 없으면 실패
  */

  if (!title) {

    return [];

  }


  return [

    {

      title:
        cleanText(title),

      artist:
        cleanText(artist),

      album: "",

      duration,

      youtubeVideoId:
        videoId,

      youtubeChannelId:
        basic.channel_id || "",

      source:
        "YouTube Music"

    }

  ];

}


/* =========================================================
   YouTube Music 플레이리스트
========================================================= */

async function getMusicPlaylist(
  youtube,
  playlistId
) {

  const playlist =
    await youtube.music.getPlaylist(
      playlistId
    );


  const contents =
    playlist?.contents;


  if (
    !contents
  ) {

    return [];

  }


  const tracks = [];


  /*
    contents에서 음악 항목 추출
  */

  for (
    const item of contents
  ) {

    const videoId =
      item?.id || "";


    const title =
      item?.title || "";


    if (
      !videoId ||
      !title
    ) {

      continue;

    }


    /*
      MusicResponsiveListItem의
      subtitle에는 보통 아티스트가
      포함되어 있다.
    */

    let artist = "";


    try {

      const subtitle =
        item?.subtitle;


      if (
        subtitle
      ) {

        artist =
          String(
            subtitle
          );

      }

    } catch {

      artist = "";

    }


    /*
      각 곡을 다시 YouTube Music에서
      확인한다.

      느리지만 정확도를 위해 사용한다.
    */

    try {

      const info =
        await youtube.music.getInfo(
          videoId
        );


      const basic =
        info?.basic_info || {};


      const finalTitle =
        cleanText(
          basic.title ||
          title
        );


      const finalArtist =
        cleanText(
          basic.author ||
          artist
        );


      const duration =
        Number(
          basic.duration || 0
        );


      if (
        !finalTitle
      ) {

        continue;

      }


      tracks.push({

        title:
          finalTitle,

        artist:
          finalArtist,

        album: "",

        duration,

        youtubeVideoId:
          videoId,

        youtubeChannelId:
          basic.channel_id || "",

        source:
          "YouTube Music"

      });

    } catch {

      /*
        개별 곡 하나가 실패해도
        전체 플레이리스트는 계속 진행
      */

      if (title) {

        tracks.push({

          title:
            cleanText(title),

          artist:
            cleanText(artist),

          album: "",

          duration: 0,

          youtubeVideoId:
            videoId,

          youtubeChannelId:
            "",

          source:
            "YouTube Music"

        });

      }

    }

  }


  return tracks;

}


/* =========================================================
   텍스트 정리
========================================================= */

function cleanText(text) {

  return String(
    text || ""
  )
    .replace(
      /<[^>]+>/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();

}
