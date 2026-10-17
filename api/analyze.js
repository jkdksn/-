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

    if (parsed.type === "video") {
      tracks = await analyzeVideo(
        youtube,
        parsed.id
      );
    } else {
      tracks = await analyzePlaylist(
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


/* =========================
   URL 분석
========================= */

function parseYouTubeURL(value) {
  try {
    const url = new URL(value);

    if (url.hostname === "youtu.be") {
      const id = url.pathname
        .replace(/^\/+/, "")
        .split("/")[0];

      if (!id) return null;

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


/* =========================
   단일 영상
========================= */

async function analyzeVideo(
  youtube,
  videoId
) {
  try {

    /*
      1차:
      일반 YouTube 영상의 기본 정보 확보
    */

    const info =
      await youtube.getInfo(
        videoId,
        "YTMUSIC"
      );

    const basic =
      info?.basic_info || {};

    const originalTitle =
      cleanText(
        basic.title || ""
      );

    const originalAuthor =
      cleanText(
        basic.author || ""
      );

    const duration =
      Number(
        basic.duration || 0
      );


    /*
      제목 + 채널명을 이용해서
      YouTube Music에서 실제 음악으로 재검색
    */

    const query =
      `${originalTitle} ${originalAuthor}`.trim();

    const search =
      await youtube.music.search(
        query,
        {
          type: "song"
        }
      );

    const results =
      search?.songs?.contents ||
      search?.contents ||
      [];

    if (!results.length) {
      return [];
    }


    /*
      검색 결과 중 가장 적합한 곡 선택
    */

    const candidates =
      results
        .map((item) => {

          const title =
            cleanText(
              getText(item?.title)
            );

          const artist =
            cleanText(
              getArtist(item)
            );

          const id =
            item?.id ||
            item?.video_id ||
            "";

          const resultDuration =
            Number(
              item?.duration?.seconds ||
              item?.duration ||
              0
            );

          const score =
            calculateScore({
              originalTitle,
              originalAuthor,
              duration,
              title,
              artist,
              resultDuration
            });

          return {
            title,
            artist,
            duration:
              resultDuration || duration,
            youtubeVideoId:
              id,
            youtubeChannelId:
              "",
            source:
              "YouTube Music",
            score
          };

        })
        .filter(
          (item) =>
            item.youtubeVideoId &&
            item.title
        )
        .sort(
          (a, b) =>
            b.score - a.score
        );


    if (!candidates.length) {
      return [];
    }


    /*
      너무 낮은 점수의 검색 결과는
      억지로 사용하지 않는다.
    */

    const best =
      candidates[0];

    if (best.score < 55) {
      return [];
    }

    return [
      {
        title:
          best.title,

        artist:
          best.artist ||
          originalAuthor,

        album: "",

        duration:
          best.duration ||
          duration,

        youtubeVideoId:
          best.youtubeVideoId,

        youtubeChannelId:
          best.youtubeChannelId,

        source:
          "YouTube Music"
      }
    ];

  } catch (error) {

    console.error(
      "Video analysis error:",
      error
    );

    return [];
  }
}


/* =========================
   플레이리스트
========================= */

async function analyzePlaylist(
  youtube,
  playlistId
) {
  try {

    const playlist =
      await youtube.music.getPlaylist(
        playlistId
      );

    const contents =
      playlist?.contents;

    if (!contents) {
      return [];
    }

    /*
      YTNode Container는 contents
      속성을 가지고 있을 수 있으므로
      최대한 안전하게 배열화
    */

    let items = [];

    if (Array.isArray(contents)) {
      items = contents;
    } else if (
      Array.isArray(contents?.contents)
    ) {
      items =
        contents.contents;
    } else if (
      typeof contents?.as === "function"
    ) {
      try {
        const inner =
          contents.as();

        if (
          Array.isArray(inner)
        ) {
          items = inner;
        }
      } catch {}
    }

    /*
      일부 YTNode 컨테이너는 length/index 접근 가능
    */

    if (
      !items.length &&
      typeof contents.length === "number"
    ) {
      for (
        let i = 0;
        i < contents.length;
        i++
      ) {
        const item =
          contents.get?.(i) ||
          contents[i];

        if (item) {
          items.push(item);
        }
      }
    }

    if (!items.length) {
      return [];
    }

    const tracks = [];

    /*
      플레이리스트 항목 하나씩
      YouTube Music 검색으로 재확인
    */

    for (const item of items) {

      try {

        const title =
          cleanText(
            getText(item?.title)
          );

        const artist =
          cleanText(
            getArtist(item)
          );

        const videoId =
          item?.id ||
          item?.video_id ||
          "";

        if (!title) {
          continue;
        }

        const query =
          `${title} ${artist}`.trim();

        const search =
          await youtube.music.search(
            query,
            {
              type: "song"
            }
          );

        const results =
          search?.songs?.contents ||
          search?.contents ||
          [];

        if (!results.length) {
          continue;
        }

        const candidates =
          results
            .map((result) => {

              const resultTitle =
                cleanText(
                  getText(result?.title)
                );

              const resultArtist =
                cleanText(
                  getArtist(result)
                );

              const resultId =
                result?.id ||
                result?.video_id ||
                "";

              const resultDuration =
                Number(
                  result?.duration?.seconds ||
                  result?.duration ||
                  0
                );

              const score =
                calculateScore({
                  originalTitle:
                    title,

                  originalAuthor:
                    artist,

                  duration: 0,

                  title:
                    resultTitle,

                  artist:
                    resultArtist,

                  resultDuration
                });

              return {
                title:
                  resultTitle,

                artist:
                  resultArtist,

                duration:
                  resultDuration,

                youtubeVideoId:
                  resultId,

                youtubeChannelId:
                  "",

                source:
                  "YouTube Music",

                score
              };

            })
            .filter(
              (result) =>
                result.youtubeVideoId &&
                result.title
            )
            .sort(
              (a, b) =>
                b.score - a.score
            );

        if (!candidates.length) {
          continue;
        }

        const best =
          candidates[0];

        if (best.score < 55) {
          continue;
        }

        tracks.push({
          title:
            best.title,

          artist:
            best.artist ||
            artist,

          album: "",

          duration:
            best.duration,

          youtubeVideoId:
            best.youtubeVideoId ||
            videoId,

          youtubeChannelId:
            best.youtubeChannelId,

          source:
            "YouTube Music"
        });

      } catch (error) {

        console.error(
          "Playlist item error:",
          error
        );

      }
    }

    return tracks;

  } catch (error) {

    console.error(
      "Playlist analysis error:",
      error
    );

    return [];
  }
}


/* =========================
   제목/가수 추출
========================= */

function getText(value) {

  if (!value) {
    return "";
  }

  if (
    typeof value === "string"
  ) {
    return value;
  }

  if (
    typeof value.toString === "function"
  ) {
    try {
      return value.toString();
    } catch {}
  }

  if (value.text) {
    return String(
      value.text
    );
  }

  return "";
}


function getArtist(item) {

  if (!item) {
    return "";
  }

  /*
    YouTube Music SongItem에서
    artist가 직접 존재하는 경우
  */

  if (item.artist) {

    const artist =
      getText(
        item.artist
      );

    if (artist) {
      return artist;
    }
  }


  /*
    artists 배열
  */

  if (
    Array.isArray(
      item.artists
    )
  ) {

    const artists =
      item.artists
        .map(
          (artist) =>
            getText(
              artist
            )
        )
        .filter(Boolean);

    if (artists.length) {
      return artists.join(", ");
    }
  }


  /*
    subtitle fallback
  */

  if (item.subtitle) {

    const subtitle =
      getText(
        item.subtitle
      );

    if (subtitle) {
      return subtitle;
    }
  }


  return "";
}


/* =========================
   검색 결과 점수
========================= */

function calculateScore({
  originalTitle,
  originalAuthor,
  duration,
  title,
  artist,
  resultDuration
}) {

  const targetTitle =
    normalize(originalTitle);

  const resultTitle =
    normalize(title);

  const targetArtist =
    normalize(originalAuthor);

  const resultArtist =
    normalize(artist);

  let score = 0;


  /*
    제목
  */

  if (
    targetTitle &&
    resultTitle
  ) {

    if (
      targetTitle === resultTitle
    ) {
      score += 60;

    } else if (
      resultTitle.includes(
        targetTitle
      ) ||
      targetTitle.includes(
        resultTitle
      )
    ) {
      score += 40;
    }

  }


  /*
    가수
  */

  if (
    targetArtist &&
    resultArtist
  ) {

    if (
      targetArtist === resultArtist
    ) {
      score += 30;

    } else if (
      resultArtist.includes(
        targetArtist
      ) ||
      targetArtist.includes(
        resultArtist
      )
    ) {
      score += 20;
    }

  }


  /*
    재생시간
  */

  if (
    duration > 0 &&
    resultDuration > 0
  ) {

    const difference =
      Math.abs(
        duration -
        resultDuration
      );

    if (difference <= 3) {
      score += 15;

    } else if (difference <= 7) {
      score += 8;
    }

  }


  return score;
}


/* =========================
   문자열 정리
========================= */

function normalize(text) {

  return String(
    text || ""
  )
    .toLowerCase()
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
      /\([^)]*\)/g,
      " "
    )
    .replace(
      /\[[^\]]*\]/g,
      " "
    )
    .replace(
      /[^a-z0-9가-힣]/gi,
      ""
    )
    .trim();
}


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
