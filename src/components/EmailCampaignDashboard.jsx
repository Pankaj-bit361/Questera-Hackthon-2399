import { useState, useEffect } from 'react';
import {
  Mail, Send, CheckCircle, XCircle, Eye, MousePointer,
  Play, Pause, RefreshCw,
  Users, AlertTriangle, FileText, Search,
  Zap, Loader2, Square
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import { getAuthToken } from '../lib/velosStorage';

const API_URL = `${API_BASE_URL}/email-campaign`;

const headers = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${getAuthToken()}`
});

// Status badge component
const StatusBadge = ({ status }) => {
  const styles = {
    sent: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    delivered: 'bg-green-500/20 text-green-400 border-green-500/30',
    opened: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    clicked: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    bounced: 'bg-red-500/20 text-red-400 border-red-500/30',
    pending: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
    completed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    in_progress: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${styles[status] || styles.pending}`}>
      {status?.replace('_', ' ')}
    </span>
  );
};

// Stat card component
const StatCard = ({ icon: Icon, label, value, subValue, trend, color = 'white' }) => (
  <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors">
    <div className="flex items-center justify-between mb-3">
      <div className={`p-2 rounded-lg bg-${color}-500/10`}>
        <Icon className={`w-4 h-4 text-${color}-400`} />
      </div>
      {trend && (
        <span className={`text-xs ${trend > 0 ? 'text-green-400' : 'text-red-400'}`}>
          {trend > 0 ? '+' : ''}{trend}%
        </span>
      )}
    </div>
    <div className="text-2xl font-bold text-white mb-1">{value}</div>
    <div className="text-xs text-zinc-500">{label}</div>
    {subValue && <div className="text-xs text-zinc-600 mt-1">{subValue}</div>}
  </div>
);

// Progress bar component
const ProgressBar = ({ value, max, color = 'white' }) => (
  <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
    <div
      className={`h-full bg-${color}-500 transition-all duration-500`}
      style={{ width: `${Math.min((value / max) * 100, 100)}%` }}
    />
  </div>
);

export default function EmailCampaignDashboard() {
  const [overview, setOverview] = useState(null);
  const [emails, setEmails] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [days, setDays] = useState([]);
  const [activeTab, setActiveTab] = useState('days');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // Refresh every 5s for live updates
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [overviewRes, emailsRes, templatesRes, daysRes] = await Promise.all([
        fetch(`${API_URL}/overview`, { headers: headers() }).then(r => r.json()),
        fetch(`${API_URL}/emails?limit=100&status=sent`, { headers: headers() }).then(r => r.json()),
        fetch(`${API_URL}/templates`, { headers: headers() }).then(r => r.json()),
        fetch(`${API_URL}/days`, { headers: headers() }).then(r => r.json())
      ]);

      setOverview(overviewRes);
      setEmails(emailsRes.emails || []);
      setTemplates(templatesRes.templates || []);
      setDays(daysRes.days || []);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch campaign data:', error);
      setLoading(false);
    }
  };

  const filteredEmails = emails.filter(e => {
    const matchesSearch = !searchQuery ||
      e.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.username?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-white"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white rounded-lg">
              <Mail className="w-5 h-5 text-black" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Email Campaign</h1>
              <p className="text-sm text-zinc-500">Velos Outreach Campaign</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchData}
              className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4 text-zinc-400" />
            </button>
            <StatusBadge status={overview?.status || 'pending'} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-800 px-6">
        <div className="flex gap-6">
          {['days', 'overview', 'emails', 'templates'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === tab
                ? 'border-white text-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
            >
              {tab === 'days' ? 'Send Emails' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {activeTab === 'days' && <DaysTab days={days} onRefresh={fetchData} />}
        {activeTab === 'overview' && <OverviewTab overview={overview} />}
        {activeTab === 'emails' && (
          <EmailsTab
            emails={filteredEmails}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
          />
        )}
        {activeTab === 'templates' && <TemplatesTab templates={templates} />}
      </div>
    </div>
  );
}

// Overview Tab
function OverviewTab({ overview }) {
  if (!overview) return null;

  return (
    <div className="space-y-6">
      {/* Progress Section */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Campaign Progress</h2>
            <p className="text-sm text-zinc-500">
              Day {overview.current?.day} of {overview.current?.total_days}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{overview.progress}%</div>
            <div className="text-sm text-zinc-500">
              {overview.sent?.toLocaleString()} / {overview.total_emails?.toLocaleString()}
            </div>
          </div>
        </div>
        <ProgressBar value={overview.sent} max={overview.total_emails} color="white" />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <StatCard icon={Send} label="Sent" value={overview.sent?.toLocaleString()} color="blue" />
        <StatCard icon={CheckCircle} label="Delivered" value={overview.delivered?.toLocaleString()}
          subValue={`${overview.rates?.delivery}%`} color="green" />
        <StatCard icon={Eye} label="Opened" value={overview.opened?.toLocaleString()}
          subValue={`${overview.rates?.open}%`} color="purple" />
        <StatCard icon={MousePointer} label="Clicked" value={overview.clicked?.toLocaleString()}
          subValue={`${overview.rates?.click}%`} color="cyan" />
        <StatCard icon={XCircle} label="Bounced" value={overview.bounced?.toLocaleString()}
          subValue={`${overview.rates?.bounce}%`} color="red" />
        <StatCard icon={AlertTriangle} label="Remaining" value={overview.remaining?.toLocaleString()} color="yellow" />
      </div>

      {/* Current Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-medium text-zinc-400 mb-4">Current Batch</h3>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500/10 rounded-xl">
              <Zap className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <div className="text-xl font-semibold">
                Day {overview.current?.day}, Batch {overview.current?.batch}
              </div>
              <div className="text-sm text-zinc-500">
                {overview.current?.total_batches - ((overview.current?.day - 1) * 100 + overview.current?.batch)} batches remaining
              </div>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-medium text-zinc-400 mb-4">Suppression List</h3>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-500/10 rounded-xl">
              <Users className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <div className="text-xl font-semibold">{overview.suppressed?.toLocaleString()}</div>
              <div className="text-sm text-zinc-500">Blocked emails (bounces + unsubscribes)</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Emails Tab
function EmailsTab({ emails, searchQuery, setSearchQuery, statusFilter, setStatusFilter }) {
  // Filter to show sent emails at top
  const sortedEmails = [...emails].sort((a, b) => {
    if (a.sentAt && !b.sentAt) return -1;
    if (!a.sentAt && b.sentAt) return 1;
    if (a.sentAt && b.sentAt) return new Date(b.sentAt) - new Date(a.sentAt);
    return 0;
  });

  const sentCount = emails.filter(e => e.status === 'sent').length;
  const pendingCount = emails.filter(e => e.status === 'pending').length;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-white">{emails.length}</div>
          <div className="text-xs text-zinc-500">Total (showing 100)</div>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-green-400">{sentCount}</div>
          <div className="text-xs text-zinc-500">Sent</div>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-zinc-400">{pendingCount}</div>
          <div className="text-xs text-zinc-500">Pending</div>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-red-400">{emails.filter(e => e.status === 'bounced').length}</div>
          <div className="text-xs text-zinc-500">Bounced</div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by email or username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-zinc-600"
        >
          <option value="all">All Status</option>
          <option value="sent">Sent</option>
          <option value="pending">Pending</option>
          <option value="opened">Opened</option>
          <option value="clicked">Clicked</option>
          <option value="bounced">Bounced</option>
        </select>
      </div>

      {/* Emails Table */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 uppercase">Email</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 uppercase">Name</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 uppercase">Category</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 uppercase">Status</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 uppercase">Sent At</th>
            </tr>
          </thead>
          <tbody>
            {sortedEmails.slice(0, 100).map((email, i) => (
              <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                <td className="py-3 px-4">
                  <div className="text-sm text-white">{email.email}</div>
                  <div className="text-xs text-zinc-500">@{email.username}</div>
                </td>
                <td className="py-3 px-4 text-sm text-white">{email.name || '-'}</td>
                <td className="py-3 px-4 text-sm text-zinc-400">{email.category || '-'}</td>
                <td className="py-3 px-4"><StatusBadge status={email.status} /></td>
                <td className="py-3 px-4 text-sm text-zinc-400">
                  {email.sentAt ? new Date(email.sentAt).toLocaleString() : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {emails.length === 0 && (
          <div className="text-center py-12 text-zinc-500">
            No emails to show
          </div>
        )}
      </div>
    </div>
  );
}

// Days Tab - Send emails by day
function DaysTab({ days, onRefresh }) {
  const [sendingDay, setSendingDay] = useState(null);

  const handleSendDay = async (day) => {
    if (!window.confirm(`Are you sure you want to send ~${day.total.toLocaleString()} emails for Day ${day.day}?`)) {
      return;
    }

    setSendingDay(day.day);
    try {
      const res = await fetch(`${API_URL}/days/${day.day}/send`, {
        method: 'POST',
        headers: headers(),
      });
      const data = await res.json();
      if (data.success) {
        onRefresh();
      } else {
        alert(data.error || 'Failed to start sending');
      }
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSendingDay(null);
    }
  };

  const handleStopDay = async (dayNum) => {
    try {
      const res = await fetch(`${API_URL}/days/${dayNum}/stop`, {
        method: 'POST',
        headers: headers(),
      });
      const data = await res.json();
      if (data.success) {
        onRefresh();
      }
    } catch (err) {
      console.error('Stop error:', err);
    }
  };

  const totalSent = days.reduce((sum, d) => sum + d.sent, 0);
  const totalEmails = days.reduce((sum, d) => sum + d.total, 0);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Campaign Progress</h2>
          <div className="text-right">
            <div className="text-2xl font-bold">{totalEmails > 0 ? Math.round((totalSent / totalEmails) * 100) : 0}%</div>
            <div className="text-sm text-zinc-500">{totalSent.toLocaleString()} / {totalEmails.toLocaleString()} sent</div>
          </div>
        </div>
        <ProgressBar value={totalSent} max={totalEmails} color="white" />
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {days.map((day) => (
          <div
            key={day.day}
            className={`bg-zinc-900/50 border rounded-xl p-5 transition-colors ${day.status === 'completed' ? 'border-green-500/30' :
              day.status === 'sending' ? 'border-yellow-500/50 animate-pulse' :
                day.status === 'partial' ? 'border-blue-500/30' :
                  'border-zinc-800'
              }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold ${day.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                  day.status === 'sending' ? 'bg-yellow-500/20 text-yellow-400' :
                    day.status === 'partial' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-zinc-800 text-zinc-400'
                  }`}>
                  {day.day}
                </div>
                <div>
                  <div className="font-medium text-white">Day {day.day}</div>
                  <div className="text-xs text-zinc-500">
                    {day.day <= 2 ? '🔥 High Priority' : day.day <= 7 ? '⚡ Medium' : '📧 Standard'}
                  </div>
                </div>
              </div>
              <StatusBadge status={day.status} />
            </div>

            {/* Progress */}
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-zinc-400">Progress</span>
                <span className="text-white">{day.progress}%</span>
              </div>
              <ProgressBar value={day.sent} max={day.total} color={
                day.status === 'completed' ? 'green' :
                  day.status === 'sending' ? 'yellow' : 'white'
              } />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 text-center text-sm mb-4">
              <div className="bg-zinc-800/50 rounded-lg py-2">
                <div className="text-white font-medium">{day.total.toLocaleString()}</div>
                <div className="text-xs text-zinc-500">Total</div>
              </div>
              <div className="bg-zinc-800/50 rounded-lg py-2">
                <div className="text-green-400 font-medium">{day.sent.toLocaleString()}</div>
                <div className="text-xs text-zinc-500">Sent</div>
              </div>
              <div className="bg-zinc-800/50 rounded-lg py-2">
                <div className="text-zinc-400 font-medium">{day.pending.toLocaleString()}</div>
                <div className="text-xs text-zinc-500">Pending</div>
              </div>
            </div>

            {/* Action Button */}
            {day.status === 'sending' ? (
              <button
                onClick={() => handleStopDay(day.day)}
                className="w-full py-2.5 px-4 rounded-lg font-medium flex items-center justify-center gap-2 bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
              >
                <Square className="w-4 h-4" />
                Stop Sending
              </button>
            ) : day.status === 'completed' ? (
              <button
                disabled
                className="w-full py-2.5 px-4 rounded-lg font-medium flex items-center justify-center gap-2 bg-green-500/10 text-green-400 border border-green-500/20 cursor-not-allowed"
              >
                <CheckCircle className="w-4 h-4" />
                Completed
              </button>
            ) : (
              <button
                onClick={() => handleSendDay(day)}
                disabled={sendingDay === day.day || !day.canSend}
                className={`w-full py-2.5 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors ${sendingDay === day.day
                  ? 'bg-zinc-700 text-zinc-400 cursor-wait'
                  : day.canSend
                    ? 'bg-white text-black hover:bg-zinc-200'
                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  }`}
              >
                {sendingDay === day.day ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Send Day {day.day}
                  </>
                )}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Warning */}
      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-yellow-200/80">
          <strong>Important:</strong> Each day can only be sent once. Once completed, the button will be disabled.
          Emails are sent at ~10/second (~600/min). A day with 10,000 emails takes ~17 minutes.
        </div>
      </div>
    </div>
  );
}


// Templates Tab
function TemplatesTab({ templates }) {
  const [selectedTemplate, setSelectedTemplate] = useState(templates[0]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Template List */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-zinc-400 mb-3">Email Templates</h3>
        {templates.map((template) => (
          <div
            key={template.id}
            onClick={() => setSelectedTemplate(template)}
            className={`p-4 rounded-xl border cursor-pointer transition-colors ${selectedTemplate?.id === template.id
              ? 'bg-zinc-800 border-zinc-600'
              : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
              }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <FileText className="w-4 h-4 text-blue-400" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-white">{template.name}</div>
                <div className="text-xs text-zinc-500">{template.used_count?.toLocaleString()} emails</div>
              </div>
            </div>
            <div className="text-xs text-zinc-400 truncate">{template.subject}</div>
          </div>
        ))}
      </div>

      {/* Template Preview */}
      <div className="lg:col-span-2">
        {selectedTemplate && (
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
            {/* Template Header */}
            <div className="p-4 border-b border-zinc-800">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-white">{selectedTemplate.name}</h3>
                <StatusBadge status="active" />
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500 w-20">Subject:</span>
                  <span className="text-white">{selectedTemplate.subject}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500 w-20">From:</span>
                  <span className="text-white">Pankaj from Velos &lt;no-reply@velosapps.com&gt;</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500 w-20">Reply-To:</span>
                  <span className="text-white">pankaj@velosapps.com</span>
                </div>
              </div>
            </div>

            {/* Email Preview */}
            <div className="p-6 bg-white text-black min-h-[400px]">
              <div className="max-w-md mx-auto">
                {/* Logo */}
                <div className="bg-gradient-to-r from-black to-zinc-800 p-6 rounded-xl mb-6">
                  <h1 className="text-white text-xl font-semibold">✨ Velos</h1>
                </div>

                <p className="mb-4">Hi <span className="font-semibold">[Name]</span>,</p>

                <p className="mb-4">
                  I noticed your amazing work as a <strong>[Category]</strong> on Instagram
                  and thought you'd love what we're building.
                </p>

                <p className="mb-4">
                  <strong>Velos</strong> is an AI platform that helps creators like you:
                </p>

                <ul className="mb-6 space-y-2">
                  <li>⚡ Generate scroll-stopping images from text prompts</li>
                  <li>🎬 Create AI-powered videos for Reels</li>
                  <li>📅 Schedule posts directly to Instagram</li>
                  <li>📊 Track your content performance</li>
                </ul>

                <p className="mb-6">
                  Creators using Velos are posting <strong>3x more content</strong> while
                  spending <strong>80% less time</strong> on creation.
                </p>

                <div className="text-center mb-6">
                  <button className="bg-black text-white px-6 py-3 rounded-lg font-semibold">
                    Start Free Trial →
                  </button>
                </div>

                <p className="mb-4">Would love to hear what you think!</p>

                <p>
                  Best,<br />
                  <strong>The Velos Team</strong>
                </p>

                <hr className="my-6 border-zinc-200" />

                <p className="text-xs text-zinc-500 text-center">
                  You're receiving this because you're a creator we admire.<br />
                  <a href="#" className="underline">Unsubscribe</a> | <a href="#" className="underline">Privacy Policy</a>
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
