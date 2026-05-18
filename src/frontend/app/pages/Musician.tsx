import { Helmet } from "react-helmet";
import PageWrapper from "../components/PageWrapper";
import TitlePage from "../components/TitlePage";
import sneakyLogo from "../assets/sneaky.jpg";
import WaveText from "../components/WaveText";
import { ExternalLink, Disc3, Radio } from "lucide-react";

type StreamingPlatform = {
  name: string;
  url: string;
  available: boolean;
  Icon: typeof Radio;
  colour: string;
};

const STREAMING_PLATFORMS: StreamingPlatform[] = [
  {
    name: "SoundCloud",
    url: "https://soundcloud.com/sneakyonnightmode/sets/prophecy",
    available: true,
    Icon: Radio,
    colour: "from-orange-500 to-red-500",
  },
  {
    name: "Spotify",
    url: "https://open.spotify.com/album/0Wyl8rlcBrZ8ML3D5NvsLs?si=k75dxZnWRKuGS7A6ssb59g",
    available: true,
    Icon: Disc3,
    colour: "from-green-500 to-green-600",
  },
];

const PREVIOUS_TRACKS = [
  {
    title: "Blast Zone",
    url: "https://soundcloud.com/sneakyonnightmode/blast-zone",
    embedId: "1879365222",
    description: "First self-produced hip-hop track.",
  },
];

const MusicianPage = () => {
  return (
    <PageWrapper>
      <Helmet>
        <title>Musician | Sneaky: Hip-Hop Producer</title>
        <meta
          name="description"
          content="Sneaky's music. Hip-hop producer and artist. Listen to the Prophecy EP on SoundCloud and follow along."
        />
        <meta property="og:title" content="Sneaky's Music: Hip-Hop Producer" />
        <meta
          property="og:description"
          content="Listen to the Prophecy EP and previous releases on SoundCloud."
        />
        <meta property="og:image" content="/image.png" />
        <meta property="og:url" content="https://sneakyofficial.com/musician" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Sneaky's Music: Hip-Hop Producer" />
        <meta
          name="twitter:description"
          content="Listen to the Prophecy EP and previous releases."
        />
        <meta name="twitter:image" content="/image.png" />
      </Helmet>

      <TitlePage
        imgSrc={sneakyLogo}
        imgAlt="Sneaky"
        verb="Makes Music"
        colour="#4ecdc4"
        TextAnimationComponent={WaveText}
      />

      <div className="text-white">
        <div className="max-w-5xl mx-auto px-6 py-12">

          {/* Prophecy EP */}
          <section className="mb-20">
            <div className="text-center mb-10">
              <p className="text-xs uppercase tracking-widest text-teal-400 font-semibold mb-3">
                Latest Release
              </p>
              <h1 className="text-5xl sm:text-6xl font-bold mb-4 bg-gradient-to-r from-teal-400 to-cyan-400 bg-clip-text text-transparent">
                Prophecy
              </h1>
              <p className="text-slate-400 text-base max-w-xl mx-auto">
                My debut EP, a personal exploration of identity, purpose, and
                where I'm headed. Available now on SoundCloud.
              </p>
            </div>

            {/* SoundCloud playlist embed */}
            <div className="glass-card overflow-hidden mb-8">
              <iframe
                title="Prophecy EP on SoundCloud"
                width="100%"
                height="450"
                scrolling="no"
                frameBorder="no"
                allow="autoplay"
                className="w-full"
                src="https://w.soundcloud.com/player/?url=https%3A//soundcloud.com/sneakyonnightmode/sets/prophecy&color=%234ecdc4&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=true"
              />
            </div>

            {/* Streaming platforms */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {STREAMING_PLATFORMS.map((platform) => {
                const { Icon } = platform;
                return platform.available ? (
                  <a
                    key={platform.name}
                    href={platform.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center justify-center gap-3 px-5 py-3.5 rounded-xl bg-gradient-to-r ${platform.colour} text-white font-semibold text-sm hover:opacity-90 transition-all duration-200 hover:scale-[1.02]`}
                  >
                    <Icon className="w-4 h-4" />
                    Listen on {platform.name}
                    <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                  </a>
                ) : (
                  <div
                    key={platform.name}
                    className={`flex items-center justify-center gap-3 px-5 py-3.5 rounded-xl bg-gradient-to-r ${platform.colour} text-white font-semibold text-sm opacity-40 cursor-not-allowed select-none`}
                  >
                    <Icon className="w-4 h-4" />
                    {platform.name} (coming soon)
                  </div>
                );
              })}
            </div>
          </section>

          {/* Previous releases */}
          <section>
            <div className="border-t border-white/10 pt-14 mb-10">
              <h2 className="text-2xl font-bold text-center mb-2">
                Previous Releases
              </h2>
              <p className="text-slate-400 text-sm text-center">
                Earlier work from before the EP.
              </p>
            </div>

            <div className="space-y-6">
              {PREVIOUS_TRACKS.map((track) => (
                <div key={track.title} className="glass-card p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <Radio className="w-4 h-4 text-orange-400 flex-shrink-0" />
                    <h3 className="text-base font-semibold text-white">
                      {track.title}
                    </h3>
                  </div>
                  <p className="text-slate-400 text-sm mb-5">
                    {track.description}
                  </p>
                  <iframe
                    title={`SoundCloud: ${track.title}`}
                    width="100%"
                    height="166"
                    scrolling="no"
                    frameBorder="no"
                    allow="autoplay"
                    className="rounded-lg w-full mb-4"
                    src={`https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/${track.embedId}&color=%234ecdc4&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false`}
                  />
                  <a
                    href={track.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-orange-400 hover:text-orange-300 transition-colors"
                  >
                    Open on SoundCloud
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              ))}
            </div>

            {/* Follow CTA */}
            <div className="mt-10 glass-card p-8 text-center">
              <h3 className="text-lg font-bold mb-2">Stay in the loop</h3>
              <p className="text-slate-400 text-sm mb-6">
                Follow on SoundCloud to catch new releases as they drop.
              </p>
              <a
                href="https://soundcloud.com/sneakyonnightmode"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-7 py-3 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl text-white font-semibold text-sm hover:opacity-90 hover:scale-[1.02] transition-all duration-200"
              >
                Follow on SoundCloud
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </section>
        </div>
      </div>
    </PageWrapper>
  );
};

export default MusicianPage;
