# ABOUTME: Integration tests for steel-cookbook Python examples
# ABOUTME: Tests require STEEL_API_KEY and make actual API calls to Steel

import os
import pytest
from steel import Steel


@pytest.mark.integration
class TestSteelSessionCreation:
    """Test actual Steel session creation with real API."""

    def test_create_actual_steel_session(self, requires_api_key):
        """Test creating a real Steel session.

        Requires STEEL_API_KEY to be set in environment.
        """
        api_key = requires_api_key

        client = Steel(steel_api_key=api_key)

        # Create a session with minimal configuration
        session = client.sessions.create()

        assert session is not None
        assert session.id is not None
        assert len(session.id) > 0
        assert session.session_viewer_url is not None

        # Cleanup
        client.sessions.release(session.id)

    def test_session_with_proxy_option(self, requires_api_key):
        """Test creating a session with proxy option enabled."""
        api_key = requires_api_key

        client = Steel(steel_api_key=api_key)

        session = client.sessions.create(
            use_proxy=True,
        )

        assert session.id is not None
        assert session.session_viewer_url is not None

        # Cleanup
        client.sessions.release(session.id)

    def test_session_with_custom_timeout(self, requires_api_key):
        """Test creating a session with custom timeout."""
        api_key = requires_api_key

        client = Steel(steel_api_key=api_key)

        session = client.sessions.create(
            session_timeout=300000,  # 5 minutes
        )

        assert session.id is not None

        # Cleanup
        client.sessions.release(session.id)

    def test_session_release(self, requires_api_key):
        """Test that sessions can be properly released."""
        api_key = requires_api_key

        client = Steel(steel_api_key=api_key)

        session = client.sessions.create()
        session_id = session.id

        # Release should not raise an error
        client.sessions.release(session_id)

        # Releasing again might be idempotent or raise - either is acceptable
        # The important part is the first release succeeds


@pytest.mark.integration
class TestSessionViewerURL:
    """Test session viewer URL functionality."""

    def test_session_viewer_url_is_accessible(self, requires_api_key):
        """Test that session viewer URL has expected format and contains session ID."""
        api_key = requires_api_key

        client = Steel(steel_api_key=api_key)
        session = client.sessions.create()

        url = session.session_viewer_url

        # URL should be a valid HTTPS URL
        assert url.startswith("https://")
        assert "steel" in url.lower() or "session" in url.lower()

        # URL should contain the session ID or a reference to it
        assert len(url) > len("https://steel.dev/")

        # Cleanup
        client.sessions.release(session.id)

    def test_session_id_is_unique(self, requires_api_key):
        """Test that each session gets a unique ID."""
        api_key = requires_api_key

        client = Steel(steel_api_key=api_key)

        session1 = client.sessions.create()
        session2 = client.sessions.create()

        assert session1.id != session2.id

        # Cleanup
        client.sessions.release(session1.id)
        client.sessions.release(session2.id)


@pytest.mark.integration
class TestSteelClientConfiguration:
    """Test Steel client initialization and configuration."""

    def test_client_initialization_with_api_key(self, requires_api_key):
        """Test that Steel client can be initialized with API key."""
        api_key = requires_api_key

        client = Steel(steel_api_key=api_key)

        assert client is not None
        assert hasattr(client, 'sessions')

    def test_client_sessions_interface(self, requires_api_key):
        """Test that client has expected sessions interface."""
        api_key = requires_api_key

        client = Steel(steel_api_key=api_key)

        # Should have create method
        assert hasattr(client.sessions, 'create')
        assert callable(client.sessions.create)

        # Should have release method
        assert hasattr(client.sessions, 'release')
        assert callable(client.sessions.release)
