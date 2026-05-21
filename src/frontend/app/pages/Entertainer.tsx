import React, { useState } from "react";
import { Helmet } from "react-helmet";
import PageWrapper from "../components/PageWrapper";
import sneakyLogo from "../assets/sneaky.jpg";
import TitlePage from "../components/TitlePage";
import SlideInText from "../components/SlideInText";
import { Youtube, Play, ExternalLink, X, Gamepad2, Tv2 } from "lucide-react";

type SocialAccount = { name: string; handle: string; description: string; url: string };
type SocialPlatform = {
  category: string;
  Icon: React.FC<React.SVGProps<SVGSVGElement>>;
  color: string;
  cta: string;
  accounts: SocialAccount[];
};
type FeaturedVideo = { id: string; title: string; channel: string };

const SOCIAL_PLATFORMS: SocialPlatform[] = [
  {
    category: "YouTube",
    Icon: Youtube,
    color: "#ef4444",
    cta: "Subscribe",
    accounts: [
      { name: "Guy On Nightmode", handle: "@guyonnightmode", description: "Anime analysis and video essays.", url: "https://youtube.com/@guyonnightmode" },
      { name: "Sneakynarnar", handle: "@sneakynarnar", description: "Splatoon content and gaming.", url: "https://youtube.com/@sneakynarnar" },
    ],
  },
  {
    category: "Short Form",
    Icon: Play,
    color: "#a855f7",
    cta: "Follow",
    accounts: [
      { name: "TikTok", handle: "@sneakynarnar", description: "Splatoon clips and highlights.", url: "https://tiktok.com/@sneakynarnar" },
      { name: "TikTok", handle: "@guy_on_nightmode", description: "Anime content.", url: "https://tiktok.com/@guy_on_nightmode" },
    ],
  },
  {
    category: "Gaming",
    Icon: Gamepad2,
    color: "#22c55e",
    cta: "View",
    accounts: [
      { name: "Steam", handle: "eliteprocrafter", description: "Steam profile.", url: "https://steamcommunity.com/id/Sneakynarnar/" },
    ],
  },
];

const FEATURED_VIDEOS: FeaturedVideo[] = [
  { id: "gr3sLTnwK00", title: "Promised Neverland Analysis - Episode 1", channel: "Guy On Nightmode" },
  { id: "TX9AdMWifEA", title: "Promised Neverland Analysis - Episode 2", channel: "Guy On Nightmode" },
  { id: "Q3e07ghcepw", title: "Promised Neverland Analysis - Episode 3", channel: "Guy On Nightmode" },
];

const Entertainer = () => {
  const [selectedVideo, setSelectedVideo] = useState<FeaturedVideo | null>(null);

  return (
    <PageWrapper>
      <Helmet>
        <title>Content | Sneaky: Anime Analysis and Gaming</title>
        <meta name="description" content="Anime analysis on Guy On Nightmode, Splatoon content on Sneakynarnar, and social media across YouTube, TikTok, and more." />
        <meta property="og:title" content="Sneaky's Content: Anime Analysis and Gaming" />
        <meta property="og:description" content="Anime analysis, gaming videos, and social updates." />
        <meta property="og:image" content="/image.png" />
        <meta property="og:url" content="https://sneakyofficial.com/entertainer" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
      </Helmet>

      <TitlePage
        imgSrc={sneakyLogo}
        imgAlt="Sneaky"
        verb="Makes Videos"
        colour="#ff6b6b"
        TextAnimationComponent={SlideInText}
      />

      <div className="max-w-5xl mx-auto px-6 pb-20 space-y-16 text-white">

        {/* Channels */}
        <section>
          <h2 className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-5 flex items-center gap-2">
            <Tv2 className="w-3.5 h-3.5" />
            Channels and socials
          </h2>
          <div className="space-y-6">
            {SOCIAL_PLATFORMS.map(platform => (
              <div key={platform.category}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg" style={{ background: `${platform.color}20`, border: `1px solid ${platform.color}30` }}>
                    <platform.Icon className="w-4 h-4" style={{ color: platform.color }} />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-300">{platform.category}</h3>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {platform.accounts.map(acc => (
                    <div key={acc.handle} className="glass-card p-5 flex flex-col gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white mb-0.5">{acc.name}</p>
                        <p className="text-xs font-mono" style={{ color: platform.color }}>{acc.handle}</p>
                      </div>
                      <p className="text-slate-400 text-xs leading-relaxed flex-1">{acc.description}</p>
                      <a
                        href={acc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold hover:opacity-90 transition-opacity self-start"
                        style={{ background: `${platform.color}20`, color: platform.color, border: `1px solid ${platform.color}30` }}
                      >
                        {platform.cta}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Featured videos */}
        <section>
          <h2 className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-5 flex items-center gap-2">
            <Youtube className="w-3.5 h-3.5" />
            Featured content
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURED_VIDEOS.map(video => (
              <button
                key={video.id}
                onClick={() => setSelectedVideo(video)}
                className="glass-card overflow-hidden text-left group hover:border-white/25 transition-all duration-200"
              >
                <div className="relative aspect-video bg-black/30">
                  <img
                    src={`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`}
                    alt={video.title}
                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                  />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-12 h-12 rounded-full bg-red-600/90 flex items-center justify-center">
                      <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-sm font-semibold text-white leading-snug mb-1">{video.title}</p>
                  <p className="text-xs text-slate-400">{video.channel}</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="glass-card p-8 text-center">
          <h3 className="text-lg font-bold mb-2">Stay updated</h3>
          <p className="text-slate-400 text-sm mb-6 max-w-md mx-auto">
            Subscribe to the channels for anime analysis and Splatoon content.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a href="https://youtube.com/@guyonnightmode" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600/80 hover:bg-red-600 rounded-xl text-white font-semibold text-sm transition-colors">
              <Youtube className="w-4 h-4" />Guy On Nightmode
            </a>
            <a href="https://youtube.com/@sneakynarnar" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600/80 hover:bg-red-600 rounded-xl text-white font-semibold text-sm transition-colors">
              <Youtube className="w-4 h-4" />Sneakynarnar
            </a>
          </div>
        </section>
      </div>

      {/* Video modal */}
      {selectedVideo && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedVideo(null)}>
          <div className="glass border border-white/15 rounded-2xl overflow-hidden max-w-3xl w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
              <div>
                <p className="text-sm font-semibold text-white">{selectedVideo.title}</p>
                <p className="text-xs text-slate-400">{selectedVideo.channel}</p>
              </div>
              <button onClick={() => setSelectedVideo(null)} className="text-slate-400 hover:text-white transition-colors p-1" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="aspect-video">
              <iframe
                src={`https://www.youtube.com/embed/${selectedVideo.id}?autoplay=1`}
                title={selectedVideo.title}
                className="w-full h-full"
                allowFullScreen
                allow="autoplay"
              />
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
};

export default Entertainer;
