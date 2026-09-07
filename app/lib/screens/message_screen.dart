import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../utils/app_theme.dart';

class MessageScreen extends StatefulWidget {
  const MessageScreen({super.key});

  @override
  State<MessageScreen> createState() => _MessageScreenState();
}

class _MessageScreenState extends State<MessageScreen> {
  final ApiService _api = ApiService();
  List<dynamic> _messages = [];
  int _unreadCount = 0;
  bool _isLoading = true;
  String _currentType = 'all';

  final List<Map<String, dynamic>> _messageTypes = [
    {'type': 'all', 'label': '全部', 'icon': Icons.all_inbox},
    {'type': 'like', 'label': '点赞', 'icon': Icons.favorite},
    {'type': 'comment', 'label': '评论', 'icon': Icons.comment},
    {'type': 'follow', 'label': '关注', 'icon': Icons.person_add},
    {'type': 'system', 'label': '系统', 'icon': Icons.notifications},
  ];

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);

    // 加载未读数
    final unreadResult = await _api.getUnreadCount();
    if (unreadResult['success']) {
      _unreadCount = unreadResult['data']['total'] ?? 0;
    }

    // 加载消息列表
    final messageResult = await _api.getMessages(type: _currentType == 'all' ? null : _currentType);
    if (messageResult['success']) {
      _messages = messageResult['data']['list'] ?? [];
    }

    setState(() => _isLoading = false);
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();

    if (!authProvider.isLoggedIn) {
      return _buildLoginRequired();
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('消息'),
        actions: [
          IconButton(
            icon: const Icon(Icons.check_circle_outline),
            onPressed: () async {
              await _api.markAllRead();
              _loadData();
            },
            tooltip: '全部已读',
          ),
        ],
      ),
      body: Column(
        children: [
          // 消息类型Tab
          Container(
            height: 80,
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              itemCount: _messageTypes.length,
              itemBuilder: (context, index) {
                final type = _messageTypes[index];
                final isSelected = _currentType == type['type'];
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          color: isSelected ? AppTheme.primaryColor.withOpacity(0.1) : Theme.of(context).cardColor,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Icon(type['icon'], color: isSelected ? AppTheme.primaryColor : Theme.of(context).textTheme.bodySmall?.color),
                      ),
                      const SizedBox(height: 4),
                      Text(type['label'], style: TextStyle(fontSize: 11, color: isSelected ? AppTheme.primaryColor : Theme.of(context).textTheme.bodySmall?.color)),
                    ],
                  ),
                );
              },
            ),
          ),
          const Divider(height: 1),
          // 消息列表
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _messages.isEmpty
                    ? _buildEmptyState()
                    : RefreshIndicator(
                        onRefresh: _loadData,
                        child: ListView.builder(
                          itemCount: _messages.length,
                          itemBuilder: (context, index) => _buildMessageItem(_messages[index]),
                        ),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildMessageItem(dynamic message) {
    final isRead = message['is_read'] == 1;
    return InkWell(
      onTap: () async {
        await _api.markMessageRead(message['id'].toString());
        _loadData();
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: isRead ? Colors.transparent : AppTheme.primaryColor.withOpacity(0.03),
          border: Border(bottom: BorderSide(color: Theme.of(context).dividerColor.withOpacity(0.1))),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 头像
            CircleAvatar(
              radius: 20,
              backgroundColor: _getMessageTypeColor(message['type']),
              child: Icon(_getMessageTypeIcon(message['type']), color: Colors.white, size: 18),
            ),
            const SizedBox(width: 12),
            // 内容
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          message['title'] ?? '消息',
                          style: TextStyle(fontWeight: isRead ? FontWeight.normal : FontWeight.w600, fontSize: 14),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      Text(
                        message['created_at'] ?? '',
                        style: TextStyle(fontSize: 11, color: Theme.of(context).textTheme.bodySmall?.color),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    message['content'] ?? '',
                    style: TextStyle(fontSize: 13, color: Theme.of(context).textTheme.bodyMedium?.color),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            // 未读标记
            if (!isRead)
              Container(
                margin: const EdgeInsets.only(left: 8, top: 4),
                width: 8,
                height: 8,
                decoration: const BoxDecoration(color: Colors.red, shape: BoxShape.circle),
              ),
          ],
        ),
      ),
    );
  }

  IconData _getMessageTypeIcon(String? type) {
    switch (type) {
      case 'like':
        return Icons.favorite;
      case 'comment':
        return Icons.comment;
      case 'follow':
        return Icons.person_add;
      case 'system':
        return Icons.notifications;
      default:
        return Icons.mail;
    }
  }

  Color _getMessageTypeColor(String? type) {
    switch (type) {
      case 'like':
        return Colors.pink;
      case 'comment':
        return Colors.blue;
      case 'follow':
        return Colors.green;
      case 'system':
        return Colors.orange;
      default:
        return AppTheme.primaryColor;
    }
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.inbox_outlined, size: 64, color: Theme.of(context).textTheme.bodySmall?.color),
          const SizedBox(height: 16),
          Text('暂时没有新消息', style: TextStyle(color: Theme.of(context).textTheme.bodySmall?.color)),
        ],
      ),
    );
  }

  Widget _buildLoginRequired() {
    return Scaffold(
      appBar: AppBar(title: const Text('消息')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.lock_outline, size: 64, color: Theme.of(context).textTheme.bodySmall?.color),
            const SizedBox(height: 16),
            Text('登录后查看消息', style: TextStyle(color: Theme.of(context).textTheme.bodySmall?.color)),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () {
                // TODO: 跳转到登录页面
              },
              child: const Text('立即登录'),
            ),
          ],
        ),
      ),
    );
  }
}
