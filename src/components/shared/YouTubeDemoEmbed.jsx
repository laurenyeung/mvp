import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { getYouTubeId } from '@/lib/youtube'

export default function YouTubeDemoEmbed({ youtubeUrl }) {
  const [demoOpen, setDemoOpen] = useState(false)
  const ytId = getYouTubeId(youtubeUrl)
  if (!ytId) return null

  return (
    <div>
      <button
        onClick={() => setDemoOpen(o => !o)}
        className="w-full flex items-center justify-between bg-orange-50 rounded-lg px-3 py-2"
      >
        <p className="text-xs font-medium text-orange-600">Example Video</p>
        {demoOpen ? <ChevronUp size={13} className="text-orange-400" /> : <ChevronDown size={13} className="text-orange-400" />}
      </button>
      {demoOpen && (
        <div className="flex justify-center mt-2">
          <div className="relative rounded-xl overflow-hidden bg-black" style={{ width: '180px', aspectRatio: '9/16' }}>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&loop=1&playlist=${ytId}&mute=1&controls=0&playsinline=1&modestbranding=1&rel=0`}
              className="absolute inset-0 w-full h-full"
              allow="autoplay; encrypted-media"
              allowFullScreen
            />
          </div>
        </div>
      )}
    </div>
  )
}
