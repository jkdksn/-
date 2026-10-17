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

    const parsed =
      parseYouTubeURL(url);

    if (!parsed) {
      return res.status(400).json({
        error: "올바른 YouTube 링크가 아닙니다."
      });
    }

    /*
      YouTube Music 연결
    */

    const youtube =
      await Innertube.create({
        lang: "ko",
        location: "KR"
      });


    let tracks = [];


    /*
      =========================
      플레이리스트
      =========================
    */

    if (parsed.type === "playlist") {

      tracks =
        await getYouTubeMusicPlaylist(
          youtube,
          parsed.id
        );

    }


    /*
      =========================
      단일 영상
      =========================
    */

    else {

      tracks =
        await getYouTubeMusicVideo(
          youtube,
          parsed.id
        );

    }


    /*
      빈 결과 방지
    */

    if (!tracks.length) {

      return res.status(404).json({
        error:
          "YouTube Music에서 곡 정보를 찾지 못했습니다."
      });

    }


    return res.status(200).json({

      success: true,

      source:
        "YouTube Music",

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
   YouTube URL 분석
========================================================= */

function parseYouTubeURL(value) {

  try {

    const url =
      new URL(value);


    /*
      youtu.be
    */

    if (
      url.hostname ===
      "youtu.be"
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


    /*
      YouTube / YouTube Music
    */

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


      /*
        영상 + playlist 링크라면
        우선 영상 자체를 분석
      */

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
   YouTube Music 단일 영상
========================================================= */

async function getYouTubeMusicVideo(
  youtube,
  videoId
) {

  /*
    YTMUSIC으로 영상 정보 요청
  */

  const info =
    await youtube.getInfo(
      videoId,
      "YTMUSIC"
    );


  const basic =
    info?.basic_info || {};


  /*
    YouTube Music의
    구조화된 음악 정보

    YouTube Music은 일부 음악 영상에서
    song / artist / album / videoId 등을
    music_tracks로 제공한다.
  */

  const musicTracks =
    Array.isArray(info?.music_tracks)
      ? info.music_tracks
      : [];


  if (
    musicTracks.length > 0
  ) {

    const tracks =
      musicTracks
        .map(track => {

          const title =
            cleanText(
              track?.song || ""
            );

          const artist =
            cleanText(
              track?.artist || ""
            );

          const album =
            cleanText(
              track?.album || ""
            );


          if (!title) {
            return null;
          }


          return {

            title,

            artist,

            album,

            duration:
              Number(
                basic.duration || 0
              ),

            youtubeVideoId:
              track?.videoId ||
              videoId,

            youtubeChannelId:
              track?.channelId ||
              basic.channel_id ||
              "",

            source:
              "YouTube Music"

          };

        })
        .filter(Boolean);


    if (tracks.length > 0) {

      return tracks;

    }

  }


  /*
    music_tracks가 없는 경우
    YTMUSIC 기본 정보에서
    제목/채널을 보조적으로 사용한다.

    단순히 모든 영상을 음악이라고
    확정하지 않기 위해
    category가 Music인지 확인한다.
  */

  const title =
    cleanVideoTitle(
      basic.title || ""
    );

  const author =
    cleanText(
      basic.author || ""
    );

  const duration =
    Number(
      basic.duration || 0
    );


  if (
    !title ||
    !author
  ) {

    return [];

  }


  /*
    Music 카테고리가 아니면
    일반 영상 제목을 곡으로
    억지로 사용하지 않는다.
  */

  if (
    basic.category &&
    String(basic.category)
      .toLowerCase() !==
      "music"
  ) {

    return [];

  }


  return [

    {

      title,

      artist: author,

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

async function getYouTubeMusicPlaylist(
  youtube,
  playlistId
) {

  const playlist =
    await youtube.getPlaylist(
      playlistId,
      {
        client:
          "YTMUSIC"
      }
    );


  const items =
    Array.isArray(
      playlist?.items
    )
      ? playlist.items
      : [];


  const tracks = [];


  for (
    const item of items
  ) {

    const videoId =
      item?.id || "";


    const title =
      cleanText(
        item?.title || ""
      );


    const artist =
      cleanText(
        item?.author || ""
      );


    const durationObject =
      item?.duration || {};


    const duration =
      Number(
        durationObject?.seconds ||
        0
      );


    /*
      삭제/비공개 등
      불완전한 항목 제외
    */

    if (
      !videoId ||
      !title ||
      title ===
        "Deleted video" ||
      title ===
        "Private video"
    ) {

      continue;

    }


    tracks.push({

      title,

      artist,

      album: "",

      duration,

      youtubeVideoId:
        videoId,

      youtubeChannelId:
        "",

      source:
        "YouTube Music"

    });

  }


  return tracks;

}


/* =========================================================
   텍스트 정리
========================================================= */

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
      /\s+/g,
      " "
    )
    .trim();

}


/* =========================================================
   일반 영상 제목에서
   불필요한 표시 제거
========================================================= */

function cleanVideoTitle(
  text
) {

  return cleanText(text)

    .replace(
      /\s*\((?:official|official video|official audio|audio|lyrics?|lyric video|가사|뮤직비디오)[^)]*\)/gi,
      ""
    )

    .replace(
      /\s*\[(?:official|official video|official audio|audio|lyrics?|lyric video|가사|뮤직비디오)[^\]]*\]/gi,
      ""
    )

    .trim();

}
