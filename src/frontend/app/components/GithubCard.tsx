import { useEffect, useState } from "react";
import { Star, GitFork, ExternalLink, Github } from "lucide-react";

type GitHubCardProps = {
  username: string;
  repo: string;
};

type RepoData = {
  name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
};

const GitHubCard = ({ username, repo }: GitHubCardProps) => {
  const [repoData, setRepoData] = useState<RepoData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`https://api.github.com/repos/${username}/${repo}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setRepoData)
      .catch(() => setError(true));
  }, [username, repo]);

  if (error) return null;

  if (!repoData) {
    return (
      <div className="w-full max-w-sm glass-card p-4 animate-pulse">
        <div className="h-4 bg-white/10 rounded mb-2 w-2/3" />
        <div className="h-3 bg-white/6 rounded mb-1 w-full" />
        <div className="h-3 bg-white/6 rounded w-3/4" />
      </div>
    );
  }

  return (
    <a
      href={repoData.html_url}
      target="_blank"
      rel="noopener noreferrer"
      className="group w-full max-w-sm glass-card p-5 hover:border-white/25 transition-all duration-200 block"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Github className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <h3 className="text-sm font-semibold text-white truncate">{repoData.name}</h3>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition-colors flex-shrink-0 ml-2" />
      </div>
      {repoData.description && (
        <p className="text-xs text-slate-400 mb-3 line-clamp-2 leading-relaxed">
          {repoData.description}
        </p>
      )}
      <div className="flex items-center gap-4 text-xs text-slate-500">
        {repoData.language && (
          <span className="px-2 py-0.5 bg-white/6 border border-white/10 rounded text-slate-400">
            {repoData.language}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Star className="w-3 h-3" />
          {repoData.stargazers_count}
        </span>
        <span className="flex items-center gap-1">
          <GitFork className="w-3 h-3" />
          {repoData.forks_count}
        </span>
      </div>
    </a>
  );
};

export default GitHubCard;
