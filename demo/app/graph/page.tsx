'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';

interface Node {
  id: string;
  label: string;
  category: string;
}

interface Edge {
  id: string;
  source: string;
  target: string;
  sourceSignal: string;
  targetSignal: string;
  weight: number;
  confidence: number;
  lag: number;
  pValue: number;
  description: string;
  isSignificant: boolean;
  effectSize: number;
}

interface GraphData {
  nodes: Node[];
  edges: Edge[];
  metadata: {
    totalRelationships: number;
    avgConfidence: string;
    avgLag: string;
  };
}

export default function GraphPage() {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/relationships');
        const graphData = await res.json();
        setData(graphData);
        setLoading(false);
      } catch (error) {
        console.error('Failed to fetch graph data:', error);
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  // Simple canvas visualization
  useEffect(() => {
    if (!data || !canvasRef.current || data.nodes.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = canvas.offsetWidth * window.devicePixelRatio;
    canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Simple circular layout
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.35;

    const nodePositions = new Map<string, { x: number; y: number }>();
    data.nodes.forEach((node, i) => {
      const angle = (i / data.nodes.length) * 2 * Math.PI - Math.PI / 2;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      nodePositions.set(node.id, { x, y });
    });

    // Draw edges
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    data.edges.forEach(edge => {
      const source = nodePositions.get(edge.source);
      const target = nodePositions.get(edge.target);
      if (!source || !target) return;

      // Draw arrow
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);

      // Color by confidence
      const confidence = edge.confidence || 0.5;
      const alpha = 0.3 + confidence * 0.7;
      ctx.strokeStyle = `rgba(59, 130, 246, ${alpha})`;
      ctx.lineWidth = 2 + edge.weight * 2;
      ctx.stroke();

      // Draw arrowhead
      const angle = Math.atan2(target.y - source.y, target.x - source.x);
      const arrowSize = 10;
      ctx.beginPath();
      ctx.moveTo(target.x, target.y);
      ctx.lineTo(
        target.x - arrowSize * Math.cos(angle - Math.PI / 6),
        target.y - arrowSize * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(
        target.x - arrowSize * Math.cos(angle + Math.PI / 6),
        target.y - arrowSize * Math.sin(angle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fillStyle = `rgba(59, 130, 246, ${alpha})`;
      ctx.fill();
    });

    // Draw nodes
    data.nodes.forEach(node => {
      const pos = nodePositions.get(node.id);
      if (!pos) return;

      // Node circle
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 30, 0, 2 * Math.PI);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Node label
      ctx.fillStyle = '#1f2937';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = node.label.split(' ')[0]; // First word only
      ctx.fillText(label, pos.x, pos.y);
    });
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Loading causal graph...</p>
        </div>
      </div>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-cyan-50 p-8">
        <div className="max-w-4xl mx-auto">
          <Link href="/" className="text-blue-600 hover:text-blue-700 mb-8 inline-block">
            ← Back to Home
          </Link>
          <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
            <div className="text-6xl mb-6">🧠</div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              No Causal Relationships Yet
            </h2>
            <p className="text-lg text-gray-600 mb-6">
              The brain is still discovering patterns. This takes 30+ days of historical data
              with clear temporal lags between events.
            </p>
            <div className="bg-blue-50 rounded-lg p-6 text-left max-w-2xl mx-auto">
              <h3 className="font-semibold text-gray-900 mb-3">What's Happening:</h3>
              <ul className="space-y-2 text-gray-700">
                <li>✓ Generating 90 days of realistic data</li>
                <li>✓ Running nightly consolidation cycles</li>
                <li>⏳ Waiting for causal patterns to emerge (lag detection needs 30+ days)</li>
                <li>⏳ Discovery typically starts around day 30-40</li>
              </ul>
            </div>
            <p className="text-sm text-gray-500 mt-6">
              Refresh this page in a few minutes to see discovered relationships
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-cyan-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="text-blue-600 hover:text-blue-700 mb-4 inline-block">
            ← Back to Home
          </Link>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent mb-2">
            Causal Knowledge Graph
          </h1>
          <p className="text-gray-600">
            {data.metadata.totalRelationships} discovered relationships •
            Avg confidence: {data.metadata.avgConfidence} •
            Avg lag: {data.metadata.avgLag} days
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Graph Visualization */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Network Visualization</h2>
              <canvas
                ref={canvasRef}
                className="w-full"
                style={{ height: '500px' }}
              />
              <p className="text-sm text-gray-500 mt-4 text-center">
                Blue arrows show causal relationships • Thicker lines = stronger evidence
              </p>
            </div>
          </div>

          {/* Relationships List */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-xl p-6 max-h-[600px] overflow-y-auto">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Discovered Relationships
              </h2>
              <div className="space-y-3">
                {data.edges.map((edge, i) => (
                  <button
                    key={edge.id}
                    onClick={() => setSelectedEdge(edge)}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                      selectedEdge?.id === edge.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-semibold text-gray-900 mb-1">
                      {i + 1}. {edge.source} → {edge.target}
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <div>Lag: {edge.lag} days</div>
                      <div>Confidence: {(edge.confidence * 100).toFixed(1)}%</div>
                      {edge.pValue < 0.05 && (
                        <div className="text-green-600 font-medium">✓ Significant (p &lt; 0.05)</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Selected Edge Details */}
        {selectedEdge && (
          <div className="mt-8 bg-white rounded-2xl shadow-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Relationship Details</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-gray-700 mb-2">Causal Link</h3>
                <p className="text-2xl font-bold text-gray-900 mb-2">
                  {selectedEdge.source} → {selectedEdge.target}
                </p>
                <p className="text-gray-600">{selectedEdge.description}</p>
              </div>
              <div className="space-y-3">
                <StatRow label="Temporal Lag" value={`${selectedEdge.lag} days`} />
                <StatRow label="Confidence" value={`${(selectedEdge.confidence * 100).toFixed(1)}%`} />
                <StatRow label="Evidence Weight" value={selectedEdge.weight.toFixed(3)} />
                <StatRow label="P-Value" value={selectedEdge.pValue.toExponential(3)} />
                <StatRow label="Effect Size" value={selectedEdge.effectSize.toFixed(2)} />
                <StatRow
                  label="Statistical Significance"
                  value={selectedEdge.isSignificant ? '✓ Significant' : '✗ Not Significant'}
                  valueClass={selectedEdge.isSignificant ? 'text-green-600' : 'text-red-600'}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatRow({ label, value, valueClass = 'text-gray-900' }: any) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-600">{label}:</span>
      <span className={`font-semibold ${valueClass}`}>{value}</span>
    </div>
  );
}
